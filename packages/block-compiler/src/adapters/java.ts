import {
  SourceSyntaxError,
  classifySeparator,
  type LanguageAdapter,
  type PairRule,
  type SeparatorAnalysis,
  type SyntaxIssue,
  type Token,
  type TokenPiece,
} from '../language-adapter';
import { JavaTokenKind, scanJava, type JavaToken } from './java-scanner';

const PAIR_RULES: readonly PairRule[] = [
  { pair: 'paren', open: '(', close: ')' },
  { pair: 'bracket', open: '[', close: ']' },
  { pair: 'brace', open: '{', close: '}' },
  { pair: 'double-quote', open: '"', close: '"' },
  { pair: 'single-quote', open: "'", close: "'" },
];

/**
 * Java adapter (§5.4.1). Lexes with a scanner written from JLS §3 and pinned to javac's own
 * tokenizer by golden data, because no maintained JavaScript lexer matches javac token for token
 * (§9.1).
 *
 * Blocks are google-java-format output holding one member: 2-space indentation and no alignment
 * spaces. Text blocks always span lines and fail with `multiline-token` in the compiler core.
 * There is no parser, so grammar is validated by tools/content-cli (§5.2).
 *
 * The scanner-error branch of classifySeparator is not expected to occur for Java. Searching 532
 * pairs of error-free single tokens (number literals against identifiers, suffixes, dots, quotes,
 * and symbols) with javac 25 found no joined text that javac splits back into [A, B] while
 * reporting an error: a malformed join comes back as one broken token (`1` + `_` gives `1_` with
 * "illegal underscore"), which is a token-mismatch. TypeScript's `1in` (TS1351) has no Java
 * counterpart: javac lexes `1in` as [1, in] without any error. The branch is kept so every
 * adapter shares the same decision procedure.
 */
export const javaAdapter: LanguageAdapter = {
  slug: 'java',
  tokenize,
  separatorRule: (prev, next) => ({ required: analyzeJavaSeparator(prev, next).required }),
  pairRules: () => [...PAIR_RULES],
  indentRule: () => ({ width: 2, alignment: 'none' }),
};

/** §3.3.1 for Java: a separator is optional only if re-lexing `A.text + B.text` yields [A, B]. */
export function analyzeJavaSeparator(
  prev: Pick<Token, 'text'>,
  next: Pick<Token, 'text'>,
): SeparatorAnalysis {
  const { tokens, errors } = scanJava(prev.text + next.text);
  return classifySeparator(
    prev.text,
    next.text,
    tokens.map((token) => token.text),
    errors.map((error) => error.code),
  );
}

/**
 * Finds Unicode escapes (JLS §3.3). javac translates them before lexing and scanJava does not,
 * so they are rejected on the raw source. A backslash starts an escape only when it is preceded
 * by an even number of contiguous backslashes: `\u0041` is an escape, `\\u0041` is not.
 */
export function findUnicodeEscapes(source: string): SyntaxIssue[] {
  const issues: SyntaxIssue[] = [];
  let index = 0;
  while (index < source.length) {
    if (source.charAt(index) !== '\\') {
      index += 1;
      continue;
    }
    let run = 0;
    while (source.charAt(index + run) === '\\') run += 1;
    const last = index + run - 1;
    if (run % 2 === 1 && source.charAt(last + 1) === 'u') {
      let end = last + 1;
      while (source.charAt(end) === 'u') end += 1;
      for (let hex = 0; hex < 4 && /^[0-9a-fA-F]$/.test(source.charAt(end)); hex += 1) end += 1;
      issues.push({
        code: 'unicode-escape',
        start: last,
        end,
        message:
          'Unicode escapes are not allowed: javac translates them before lexing, so the displayed text would not match the tokens',
      });
    }
    index += run;
  }
  return issues;
}

function tokenize(source: string): Token[] {
  // Must run before the scanner: with an untranslated Unicode escape in the source, the
  // scanner's token boundaries (and any errors it reports) would be meaningless.
  const escapes = findUnicodeEscapes(source);
  if (escapes.length > 0) throw new SourceSyntaxError(escapes);

  const { tokens, errors } = scanJava(source);
  if (errors.length > 0) {
    throw new SourceSyntaxError(errors.map(({ start, end, message }) => ({ start, end, message })));
  }

  return tokens.map((token) => ({
    kind: token.kind,
    text: token.text,
    start: token.start,
    end: token.end,
    pieces: splitPieces(token),
  }));
}

function splitPieces({ kind, text }: JavaToken): TokenPiece[] {
  const plain = (value: string): TokenPiece[] =>
    value === '' ? [] : [{ role: 'plain', text: value }];
  const quoted = (pair: string, quote: string): TokenPiece[] => [
    { role: 'open', pair, text: quote },
    ...plain(text.slice(1, -1)),
    { role: 'close', pair, text: quote },
  ];

  switch (kind) {
    case JavaTokenKind.String:
      return quoted('double-quote', '"');
    case JavaTokenKind.Char:
      return quoted('single-quote', "'");
    case JavaTokenKind.Operator: {
      const rule = PAIR_RULES.find(
        (candidate) => candidate.open === text || candidate.close === text,
      );
      if (rule === undefined || rule.pair.endsWith('quote')) return plain(text);
      return [{ role: rule.open === text ? 'open' : 'close', pair: rule.pair, text }];
    }
    default:
      // Text blocks span lines and are rejected by the compiler core as multiline tokens.
      return plain(text);
  }
}
