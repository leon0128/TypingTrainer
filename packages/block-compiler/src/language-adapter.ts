import type { CompileErrorCode } from './compile-error';

/** One part of a lexer token: typed as-is, or one side of an automatically closed pair. */
export type TokenPiece =
  | { readonly role: 'plain'; readonly text: string }
  | { readonly role: 'open' | 'close'; readonly text: string; readonly pair: string };

export interface Token {
  /** Adapter-specific token kind (for TypeScript, a `ts.SyntaxKind`). */
  readonly kind: number;
  /** The whole lexer token. Separator rules re-lex this text, never the pieces. */
  readonly text: string;
  /** Offsets into the block source; `text === source.slice(start, end)`. */
  readonly start: number;
  readonly end: number;
  /** How the token splits into typed and paired parts. Concatenated, they equal `text`. */
  readonly pieces: readonly TokenPiece[];
}

export interface SeparatorRule {
  readonly required: boolean;
}

export interface PairRule {
  /** Identifier referenced by `TokenPiece.pair`. */
  readonly pair: string;
  readonly open: string;
  readonly close: string;
}

export interface IndentRule {
  /** Spaces per indentation level. Indentation that is not a multiple is a compile error. */
  readonly width: number;
  /**
   * How runs of spaces between tokens on one line are treated.
   * - 'none'  : the formatter never aligns; more than one space is a compile error.
   * - 'spaces': the formatter aligns with spaces (gofmt); extra spaces become a `padding` atom.
   */
  readonly alignment: 'none' | 'spaces';
}

/** A language adapter (§5.4). The compiler core knows nothing about any specific language. */
export interface LanguageAdapter {
  readonly slug: string;
  /**
   * Splits a block into tokens in source order. Throws `SourceSyntaxError` when the source does
   * not parse, because token boundaries are unreliable in that case.
   */
  tokenize(source: string): Token[];
  /** Decides separator requirements between two tokens (§3.3.1). */
  separatorRule(prev: Token, next: Token): SeparatorRule;
  /** Pairs eligible for automatic closing. */
  pairRules(): PairRule[];
  /** Indentation width and style. */
  indentRule(): IndentRule;
}

/** Why a separator is or is not required, shared by every adapter's re-lexing rule (§3.3.1). */
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
  /** Adapter-specific identifiers of scanner errors (TypeScript: numeric diagnostic codes). */
  readonly scannerErrors: readonly (number | string)[];
}

/** Turns the result of re-lexing `prev + next` into a separator decision (§3.3.1). */
export function classifySeparator(
  prev: string,
  next: string,
  tokens: readonly string[],
  scannerErrors: readonly (number | string)[],
): SeparatorAnalysis {
  const separable = tokens.length === 2 && tokens[0] === prev && tokens[1] === next;
  if (!separable) return { required: true, reason: 'token-mismatch', tokens, scannerErrors };
  if (scannerErrors.length > 0) {
    return { required: true, reason: 'scanner-error', tokens, scannerErrors };
  }
  return { required: false, reason: 'separable', tokens, scannerErrors };
}

/** Fails to typecheck if `T` names a code that CompileErrorCode does not define. */
type CompileErrorCodeSubset<T extends CompileErrorCode> = T;

/** Stage 1 diagnostics an adapter may report; anything else is a stage 2 or 3 concern. */
export type SyntaxIssueCode = CompileErrorCodeSubset<'syntax' | 'unicode-escape'>;

export interface SyntaxIssue {
  readonly start: number;
  readonly end: number;
  readonly message: string;
  /** Defaults to 'syntax'. */
  readonly code?: SyntaxIssueCode;
}

export class SourceSyntaxError extends Error {
  readonly issues: readonly SyntaxIssue[];

  constructor(issues: readonly SyntaxIssue[]) {
    super(`The source has ${String(issues.length)} syntax error(s)`);
    this.name = 'SourceSyntaxError';
    this.issues = issues;
  }
}
