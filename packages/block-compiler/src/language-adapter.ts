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

export interface SyntaxIssue {
  readonly start: number;
  readonly end: number;
  readonly message: string;
}

export class SourceSyntaxError extends Error {
  readonly issues: readonly SyntaxIssue[];

  constructor(issues: readonly SyntaxIssue[]) {
    super(`The source has ${String(issues.length)} syntax error(s)`);
    this.name = 'SourceSyntaxError';
    this.issues = issues;
  }
}
