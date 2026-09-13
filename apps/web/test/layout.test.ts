import { describe, expect, it } from 'vitest';

import { buildLayout } from '../src/features/play/layout';
import { IF_PROGRAM, PADDED_PROGRAM } from './program-fixture';

describe('buildLayout', () => {
  const layout = buildLayout(IF_PROGRAM);

  it('splits the canonical code into lines at line-break separators', () => {
    expect(layout.lines.map((line) => line.cells.map((cell) => cell.text).join(''))).toEqual([
      'if (a) {',
      '  b',
      '}',
    ]);
  });

  it('gives every character a cell and ends broken lines with an eol cell', () => {
    expect(layout.lines.map((line) => line.cells.map((cell) => cell.kind))).toEqual([
      ['literal', 'literal', 'space', 'literal', 'literal', 'auto', 'space', 'literal', 'eol'],
      ['auto', 'auto', 'literal', 'eol'],
      ['auto'],
    ]);
  });

  it('lists the auto atoms on each line', () => {
    expect(layout.lines.map((line) => line.autoAtoms)).toEqual([[4], [8], [11]]);
  });

  it('maps every atom to the line and cell of its first character', () => {
    expect(layout.atomStarts).toEqual([
      { line: 0, cell: 0 },
      { line: 0, cell: 2 },
      { line: 0, cell: 3 },
      { line: 0, cell: 4 },
      { line: 0, cell: 5 },
      { line: 0, cell: 6 },
      { line: 0, cell: 7 },
      { line: 0, cell: 8 },
      { line: 1, cell: 0 },
      { line: 1, cell: 2 },
      { line: 1, cell: 3 },
      { line: 2, cell: 0 },
    ]);
  });

  it('gives alignment padding its own cells, outside the auto atoms', () => {
    const padded = buildLayout(PADDED_PROGRAM);
    const [line] = padded.lines;
    expect(line?.cells.map((cell) => cell.text).join('')).toBe('a:  1');
    expect(line?.cells.map((cell) => cell.kind)).toEqual([
      'literal',
      'literal',
      'padding',
      'space',
      'literal',
    ]);
    expect(line?.autoAtoms).toEqual([]);
  });
});
