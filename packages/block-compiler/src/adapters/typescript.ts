import ts from 'typescript';

import {
  SourceSyntaxError,
  type LanguageAdapter,
  type PairRule,
  type SyntaxIssue,
  type Token,
  type TokenPiece,
} from '../language-adapter';

const PAIR_RULES: readonly PairRule[] = [
  { pair: 'paren', open: '(', close: ')' },
  { pair: 'bracket', open: '[', close: ']' },
  { pair: 'brace', open: '{', close: '}' },
  { pair: 'substitution', open: '${', close: '}' },
  { pair: 'double-quote', open: '"', close: '"' },
  { pair: 'single-quote', open: "'", close: "'" },
  { pair: 'backtick', open: '`', close: '`' },
];

/**
 * TypeScript adapter (§5.4.1). Lexes with the official `typescript` package rather than
 * tree-sitter, because §3.3.1 needs token-level re-lexing (docs/requirements.md §9.1).
 *
 * Note on pairing errors: `unmatched-close`, `mismatched-close`, and `unclosed-open` are not
 * reachable through this adapter. The TypeScript parser reports every unbalanced bracket, brace,
 * string, or template as a syntax error first (e.g. TS1005, TS1135, TS1160), and the compiler
 * stops at syntax errors. The compiler core still checks pairing for adapters without a parser.
 */
export const typescriptAdapter: LanguageAdapter = {
  slug: 'typescript',
  tokenize,
  separatorRule: (prev, next) => ({ required: analyzeSeparator(prev, next).required }),
  pairRules: () => [...PAIR_RULES],
  indentRule: () => ({ width: 2 }),
};

function tokenize(source: string): Token[] {
  const sourceFile = ts.createSourceFile(
    'block.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const issues = readParseDiagnostics(sourceFile);
  if (issues.length > 0) throw new SourceSyntaxError(issues);

  // Leaf nodes of the syntax tree are the tokens, with boundaries the parser has already
  // disambiguated: `>>` closing two type argument lists stays two tokens, regular expressions
  // and template literal parts are single tokens.
  const tokens: Token[] = [];
  const visit = (node: ts.Node): void => {
    // Comments are reported by the compiler core as non-whitespace between tokens.
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) {
      return;
    }
    const children = node.getChildren(sourceFile);
    if (children.length > 0) {
      for (const child of children) visit(child);
      return;
    }
    if (node.kind === ts.SyntaxKind.EndOfFileToken) return;
    const start = node.getStart(sourceFile);
    if (start === node.end) return; // empty syntax lists
    const text = source.slice(start, node.end);
    tokens.push({
      kind: node.kind,
      text,
      start,
      end: node.end,
      pieces: splitPieces(node.kind, text),
    });
  };
  visit(sourceFile);
  return tokens;
}

function splitPieces(kind: ts.SyntaxKind, text: string): TokenPiece[] {
  const plain = (value: string): TokenPiece[] =>
    value === '' ? [] : [{ role: 'plain', text: value }];
  const open = (pair: string, value: string): TokenPiece => ({ role: 'open', pair, text: value });
  const close = (pair: string, value: string): TokenPiece => ({ role: 'close', pair, text: value });

  switch (kind) {
    case ts.SyntaxKind.OpenParenToken:
      return [open('paren', text)];
    case ts.SyntaxKind.CloseParenToken:
      return [close('paren', text)];
    case ts.SyntaxKind.OpenBracketToken:
      return [open('bracket', text)];
    case ts.SyntaxKind.CloseBracketToken:
      return [close('bracket', text)];
    case ts.SyntaxKind.OpenBraceToken:
      return [open('brace', text)];
    case ts.SyntaxKind.CloseBraceToken:
      return [close('brace', text)];
    case ts.SyntaxKind.StringLiteral: {
      // The whole string is one token, so an apostrophe inside "don't" is never paired.
      const quote = text.slice(0, 1);
      const pair = quote === '"' ? 'double-quote' : 'single-quote';
      return [open(pair, quote), ...plain(text.slice(1, -1)), close(pair, quote)];
    }
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      return [open('backtick', '`'), ...plain(text.slice(1, -1)), close('backtick', '`')];
    case ts.SyntaxKind.TemplateHead: // `text${
      return [open('backtick', '`'), ...plain(text.slice(1, -2)), open('substitution', '${')];
    case ts.SyntaxKind.TemplateMiddle: // }text${
      return [close('substitution', '}'), ...plain(text.slice(1, -2)), open('substitution', '${')];
    case ts.SyntaxKind.TemplateTail: // }text`
      return [close('substitution', '}'), ...plain(text.slice(1, -1)), close('backtick', '`')];
    default:
      return plain(text);
  }
}

export interface SeparatorAnalysis {
  readonly required: boolean;
  /**
   * - 'token-mismatch': re-lexing `A + B` did not yield exactly [A, B] -> required
   * - 'scanner-error' : it did, but the scanner reported an error -> required
   * - 'separable'     : exactly [A, B] with no scanner error -> optional
   */
  readonly reason: 'token-mismatch' | 'scanner-error' | 'separable';
  /** Token texts produced by re-lexing `A + B`. */
  readonly tokens: readonly string[];
  /** Diagnostic codes reported by the scanner while re-lexing. */
  readonly scannerErrors: readonly number[];
}

/** §3.3.1: a separator is optional only if re-lexing `A.text + B.text` yields exactly [A, B]. */
export function analyzeSeparator(
  prev: Pick<Token, 'kind' | 'text'>,
  next: Pick<Token, 'kind' | 'text'>,
): SeparatorAnalysis {
  const joined = prev.text + next.text;
  const boundary = prev.text.length;
  const scannerErrors: number[] = [];
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    joined,
    (message) => {
      scannerErrors.push(message.code);
    },
  );

  const tokens: string[] = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    const start = scanner.getTokenStart();
    if (kind === ts.SyntaxKind.GreaterThanToken) {
      // The plain scanner never fuses `>`; the parser would, in expression context. Assume
      // fusion (`>=`, `>>`) so that an uncertain separator is conservatively required.
      scanner.reScanGreaterToken();
    } else if (
      kind === ts.SyntaxKind.CloseBraceToken &&
      ((start === 0 && isTemplateContinuation(prev.kind)) ||
        (start === boundary && isTemplateContinuation(next.kind)))
    ) {
      scanner.reScanTemplateToken(false);
    } else if (
      (kind === ts.SyntaxKind.SlashToken || kind === ts.SyntaxKind.SlashEqualsToken) &&
      start === boundary &&
      isRegularExpression(next.kind)
    ) {
      scanner.reScanSlashToken();
    }
    tokens.push(scanner.getTokenText());
  }

  const separable = tokens.length === 2 && tokens[0] === prev.text && tokens[1] === next.text;
  if (!separable) return { required: true, reason: 'token-mismatch', tokens, scannerErrors };
  if (scannerErrors.length > 0) {
    return { required: true, reason: 'scanner-error', tokens, scannerErrors };
  }
  return { required: false, reason: 'separable', tokens, scannerErrors };
}

// Token kinds are plain numbers in the adapter-neutral Token type; for this adapter they are
// always ts.SyntaxKind values.
function isTemplateContinuation(kind: ts.SyntaxKind): boolean {
  return kind === ts.SyntaxKind.TemplateMiddle || kind === ts.SyntaxKind.TemplateTail;
}

function isRegularExpression(kind: ts.SyntaxKind): boolean {
  return kind === ts.SyntaxKind.RegularExpressionLiteral;
}

/**
 * Reads `SourceFile.parseDiagnostics`, which is internal to the TypeScript compiler and absent
 * from its public typings. This package pins TypeScript to 6.x (see package.json), where it is an
 * array of diagnostics with numeric `start`/`length` and a `messageText`. The shape is validated
 * so that an upgrade fails loudly instead of silently skipping the syntax check.
 */
export function readParseDiagnostics(sourceFile: object): SyntaxIssue[] {
  const raw: unknown = (sourceFile as { parseDiagnostics?: unknown }).parseDiagnostics;
  if (!Array.isArray(raw)) {
    throw new Error(
      `Unexpected TypeScript internals: SourceFile.parseDiagnostics is ${raw === null ? 'null' : typeof raw}, expected an array. block-compiler relies on TypeScript 6.x (installed: ${ts.version}).`,
    );
  }
  return raw.map((item: unknown, index) => {
    if (!isDiagnosticLike(item)) {
      throw new Error(
        `Unexpected TypeScript internals: SourceFile.parseDiagnostics[${String(index)}] lacks numeric start/length or messageText. block-compiler relies on TypeScript 6.x (installed: ${ts.version}).`,
      );
    }
    return {
      start: item.start,
      end: item.start + item.length,
      message: ts.flattenDiagnosticMessageText(item.messageText, ' '),
    };
  });
}

function isDiagnosticLike(
  value: unknown,
): value is { start: number; length: number; messageText: string | ts.DiagnosticMessageChain } {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.start === 'number' &&
    typeof candidate.length === 'number' &&
    (typeof candidate.messageText === 'string' ||
      (typeof candidate.messageText === 'object' && candidate.messageText !== null))
  );
}
