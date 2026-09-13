export type CompileErrorCode =
  // Stage 1: parsing.
  | 'syntax'
  // Stage 2: characters and whitespace between tokens (§5.1).
  | 'non-ascii'
  | 'tab'
  | 'carriage-return'
  | 'comment'
  | 'leading-indentation'
  | 'blank-line'
  | 'trailing-whitespace'
  | 'indentation-width'
  // Stage 2: pairing.
  | 'unmatched-close'
  | 'mismatched-close'
  | 'unclosed-open'
  // Stage 2: typing program constraints (§3.3).
  | 'space-literal-after-separator'
  // Stage 3: fail-safe. The output violated TypingProgramSchema, which indicates a compiler bug.
  | 'invalid-program';

export interface SourcePosition {
  /** 0-based UTF-16 offset into the block source. */
  readonly offset: number;
  /** 1-based. */
  readonly line: number;
  /** 1-based. */
  readonly column: number;
}

export interface CompileDiagnostic {
  readonly code: CompileErrorCode;
  /** English, without a position prefix. */
  readonly message: string;
  readonly start: SourcePosition;
  /** Exclusive; equal to `start` for zero-width issues. */
  readonly end: SourcePosition;
}

export class CompileError extends Error {
  readonly blockId: string;
  /** Never empty; sorted by start offset. */
  readonly diagnostics: readonly CompileDiagnostic[];

  constructor(blockId: string, diagnostics: readonly CompileDiagnostic[]) {
    if (diagnostics.length === 0) throw new Error('CompileError requires at least one diagnostic');
    const lines = diagnostics.map(
      (d) => `  ${String(d.start.line)}:${String(d.start.column)} ${d.code}: ${d.message}`,
    );
    super(`Cannot compile block "${blockId}":\n${lines.join('\n')}`);
    this.name = 'CompileError';
    this.blockId = blockId;
    this.diagnostics = diagnostics;
  }
}
