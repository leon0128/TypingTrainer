import type { PoolKind } from '@typing-trainer/contracts';

import type { ContentDiagnostic } from '../diagnostics';

export interface SourceLine {
  readonly text: string;
  /** 1-based line of the file. */
  readonly number: number;
}

/** One block of a pool file: a line, or the consecutive lines of a paragraph. */
export interface SourceBlock {
  readonly lines: readonly SourceLine[];
}

/** The text a block's id is made from, and what identical blocks share. */
export const blockSource = (block: SourceBlock): string =>
  block.lines.map((line) => line.text).join('\n');

/**
 * Splits a pool file into blocks (§13.4). Word and sentence pools have a block on every line;
 * paragraph blocks are runs of lines separated by blank lines. Lines starting with `#` are
 * comments and are skipped without ending a paragraph. Whitespace at either end of a line, tabs,
 * and carriage returns are reported: a block's text is typed as written.
 */
export function parsePoolFile(
  text: string,
  kind: PoolKind,
  file: string,
): { blocks: SourceBlock[]; diagnostics: ContentDiagnostic[] } {
  const blocks: SourceBlock[] = [];
  const diagnostics: ContentDiagnostic[] = [];
  let current: SourceLine[] = [];
  const flush = (): void => {
    if (current.length > 0) blocks.push({ lines: current });
    current = [];
  };
  const report = (line: number, column: number, code: string, message: string): void => {
    diagnostics.push({ file, line, column, stage: 'discover', code, message });
  };

  text.split('\n').forEach((raw, index) => {
    const number = index + 1;
    if (raw.includes('\r'))
      report(number, raw.indexOf('\r') + 1, 'carriage-return', 'use \\n line ends');
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('#')) return;
    if (line.trim() === '') {
      if (line !== '') report(number, 1, 'whitespace', 'a blank line is empty, not spaces');
      flush();
      return;
    }
    if (line.includes('\t')) report(number, line.indexOf('\t') + 1, 'tab', 'tabs are not allowed');
    if (line !== line.trim()) {
      report(number, 1, 'whitespace', 'a line does not start or end with whitespace');
    }
    if (kind === 'paragraph') {
      current.push({ text: line, number });
    } else {
      flush();
      blocks.push({ lines: [{ text: line, number }] });
    }
  });
  flush();
  return { blocks, diagnostics };
}
