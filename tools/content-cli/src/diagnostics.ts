/** Pipeline stages of the content CLI, in order (§5.2). */
export type ContentStage =
  | 'discover'
  | 'parse'
  | 'format'
  | 'toolchain'
  | 'tree-sitter'
  | 'constraints'
  | 'compile'
  | 'dedupe'
  | 'bundle';

export interface ContentDiagnostic {
  /** Path relative to the repository root, with forward slashes. */
  readonly file: string;
  /** 1-based. */
  readonly line: number;
  /** 1-based. */
  readonly column: number;
  readonly stage: ContentStage;
  readonly code: string;
  readonly message: string;
}

export function formatDiagnostic(diagnostic: ContentDiagnostic): string {
  const { file, line, column, stage, code, message } = diagnostic;
  return `${file}:${String(line)}:${String(column)} ${stage}/${code} ${message}`;
}

/** Stages whose errors mean the source does not parse, so later stages would be meaningless. */
export const SYNTAX_STAGES: ReadonlySet<ContentStage> = new Set(['toolchain', 'tree-sitter']);
