import {
  SourceSyntaxError,
  classifySeparator,
  type LanguageAdapter,
  type PairRule,
  type SeparatorAnalysis,
  type Token,
  type TokenPiece,
} from '../language-adapter';
import {
  PythonTokenKind,
  scanPython,
  type PythonScanErrorCategory,
  type PythonToken,
} from './python-scanner';

const PAIR_RULES: readonly PairRule[] = [
  { pair: 'paren', open: '(', close: ')' },
  { pair: 'bracket', open: '[', close: ']' },
  { pair: 'brace', open: '{', close: '}' },
  { pair: 'double-quote', open: '"', close: '"' },
  { pair: 'single-quote', open: "'", close: "'" },
  { pair: 'triple-double-quote', open: '"""', close: '"""' },
  { pair: 'triple-single-quote', open: "'''", close: "'''" },
];

const QUOTE_PAIRS: Readonly<Record<string, string>> = {
  '"': 'double-quote',
  "'": 'single-quote',
  '"""': 'triple-double-quote',
  "'''": 'triple-single-quote',
};

/**
 * Python adapter (§5.4.1). Lexes with a scanner written for Python 3.12 (PEP 701 f-strings) and
 * pinned to CPython 3.12 by golden data, because no JavaScript port of CPython's tokenizer exists
 * and tree-sitter cannot re-lex token pairs (§9.1).
 *
 * Blocks are black output (`--target-version py312`): 4-space indentation and no alignment spaces.
 * INDENT and DEDENT need no atoms: the canonical indentation after each line break is an auto atom,
 * so leaving several levels at once is a single Enter. Bracket errors are reported by the scanner
 * as syntax errors, so the core pairing checks are not reached through this adapter.
 */
export const pythonAdapter: LanguageAdapter = {
  slug: 'python',
  tokenize,
  separatorRule: (prev, next) => ({ required: analyzePythonSeparator(prev, next).required }),
  pairRules: () => [...PAIR_RULES],
  indentRule: () => ({ width: 4, alignment: 'none' }),
};

export interface PythonRelex {
  /** The text that was scanned as a fragment. */
  readonly text: string;
  readonly tokens: readonly string[];
  readonly errors: readonly { readonly code: string; readonly category: PythonScanErrorCategory }[];
}

export type PythonCorrection = 'complete-fstring-start' | 'ignore-bracket-balance';

export interface PythonSeparatorAnalysis extends SeparatorAnalysis {
  /** The plain re-lex of `prev.text + next.text`, before any correction. */
  readonly raw: PythonRelex;
  /** The re-lex the decision is based on: completed text, bracket errors removed. */
  readonly corrected: PythonRelex;
  /** The corrections that changed the input or dropped errors, in application order. */
  readonly corrections: readonly PythonCorrection[];
}

/** Re-lexes a fragment such as two joined tokens, without indentation or block checks. */
export function relexPython(text: string): PythonRelex {
  const { tokens, errors } = scanPython(text, { fragment: true });
  return {
    text,
    tokens: tokens.map((token) => token.text),
    errors: errors.map(({ code, category }) => ({ code, category })),
  };
}

/**
 * Correction `ignore-bracket-balance`: keeps only lexical errors. A two-token fragment such as `=[`
 * or `x}` cannot balance its brackets, which says nothing about whether the tokens fuse. Every
 * other error is kept: for the fragment `1or)` the unmatched `)` is dropped while `number-keyword`
 * survives (tested in python-adapter.test.ts).
 */
export function lexicalErrors(relex: PythonRelex): PythonRelex['errors'] {
  return relex.errors.filter((error) => error.category === 'lexical');
}

/**
 * §3.3.1 for Python: a separator is optional only if re-lexing `A.text + B.text` yields [A, B].
 *
 * A token pair is a fragment out of context, so two corrections are applied before deciding. Both
 * the raw re-lex and the corrected one are returned (and recorded in the golden data), so the
 * corrections can be reviewed on their own:
 *
 * - `complete-fstring-start` fires when `next` is an f-string start (`f"`, `rf"`, `f"""`). The
 *   start alone is an unterminated literal, so its closing quote is appended and the trailing
 *   FSTRING_END is not compared: `= f"` re-lexes as `=f""` (separable), `= f"""` as `=f""""""`
 *   (separable), while `return f"""` becomes [returnf, """"""] (token-mismatch, required).
 * - `ignore-bracket-balance` fires when the fragment reports bracket errors, which it drops:
 *   `= [`, `return [`, `except (`, `if (`, `: (` (unclosed opener) and `) +`, `) as`, `x }`
 *   (unmatched closer) are separable. `( f'''` fires both corrections.
 *
 * Unlike Java, the scanner-error branch is real for Python: `1 if` splits into [1, if] but CPython
 * 3.12 warns "invalid decimal literal", so that separator is required.
 */
export function analyzePythonSeparator(
  prev: Pick<Token, 'kind' | 'text'>,
  next: Pick<Token, 'kind' | 'text'>,
): PythonSeparatorAnalysis {
  const raw = relexPython(prev.text + next.text);
  const corrections: PythonCorrection[] = [];

  let closingQuote: string | undefined;
  let completed = raw;
  if (next.kind === PythonTokenKind.FStringStart) {
    closingQuote = next.text.replace(/^[A-Za-z]+/, '');
    completed = relexPython(prev.text + next.text + closingQuote);
    corrections.push('complete-fstring-start');
  }

  const lexical = lexicalErrors(completed);
  if (lexical.length !== completed.errors.length) corrections.push('ignore-bracket-balance');

  let compared = completed.tokens;
  if (closingQuote !== undefined && compared.length === 3 && compared[2] === closingQuote) {
    compared = compared.slice(0, 2);
  }
  const decision = classifySeparator(
    prev.text,
    next.text,
    compared,
    lexical.map((error) => error.code),
  );
  return {
    ...decision,
    raw,
    corrected: { text: completed.text, tokens: completed.tokens, errors: lexical },
    corrections,
  };
}

function tokenize(source: string): Token[] {
  const { tokens, errors } = scanPython(source);
  if (errors.length > 0) {
    throw new SourceSyntaxError(
      errors.map(({ code, start, end, message }) => ({
        start,
        end,
        message,
        code: code === 'fstring-brace-escape' ? 'fstring-brace-escape' : 'syntax',
      })),
    );
  }
  return tokens.map((token) => ({
    kind: token.kind,
    text: token.text,
    start: token.start,
    end: token.end,
    pieces: splitPieces(token),
  }));
}

function quotePair(quote: string): string {
  const pair = QUOTE_PAIRS[quote];
  if (pair === undefined)
    throw new Error(`Python adapter: unexpected quote ${JSON.stringify(quote)}`);
  return pair;
}

function splitPieces({ kind, text }: PythonToken): TokenPiece[] {
  const plain = (value: string): TokenPiece[] =>
    value === '' ? [] : [{ role: 'plain', text: value }];

  switch (kind) {
    case PythonTokenKind.String: {
      const prefix = /^[A-Za-z]*/.exec(text)?.[0] ?? '';
      const rest = text.slice(prefix.length);
      const quote =
        rest.startsWith('"""') || rest.startsWith("'''") ? rest.slice(0, 3) : rest.slice(0, 1);
      const pair = quotePair(quote);
      return [
        { role: 'open', pair, text: prefix + quote },
        ...plain(text.slice(prefix.length + quote.length, text.length - quote.length)),
        { role: 'close', pair, text: quote },
      ];
    }
    case PythonTokenKind.FStringStart: {
      const quote = text.replace(/^[A-Za-z]+/, '');
      return [{ role: 'open', pair: quotePair(quote), text }];
    }
    case PythonTokenKind.FStringEnd:
      return [{ role: 'close', pair: quotePair(text), text }];
    case PythonTokenKind.Operator: {
      const rule = PAIR_RULES.slice(0, 3).find(
        (candidate) => candidate.open === text || candidate.close === text,
      );
      if (rule === undefined) return plain(text);
      return [{ role: rule.open === text ? 'open' : 'close', pair: rule.pair, text }];
    }
    default:
      return plain(text);
  }
}
