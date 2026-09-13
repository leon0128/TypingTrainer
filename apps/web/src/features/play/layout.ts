import type { TypingProgram } from '@typing-trainer/contracts';

/**
 * One character position on screen. In-line space separators are one `space` cell; a line-break
 * separator is an empty `eol` cell at the end of its line, so the caret has a place to sit.
 * Alignment padding is one `padding` cell per space and never changes state.
 */
export type Cell =
  | {
      readonly kind: 'literal' | 'padding' | 'space' | 'eol';
      readonly text: string;
      readonly atomIndex: number;
      readonly charIndex: number;
    }
  | {
      readonly kind: 'auto';
      readonly text: string;
      readonly atomIndex: number;
      readonly charIndex: number;
      readonly filledBy: number;
    };

export interface LineModel {
  readonly cells: readonly Cell[];
  /** Indices of the auto atoms that have at least one cell on this line. */
  readonly autoAtoms: readonly number[];
}

export interface Layout {
  readonly lines: readonly LineModel[];
  /** For each atom, the line and cell of its first character (untyped atoms included). */
  readonly atomStarts: readonly { readonly line: number; readonly cell: number }[];
}

/** Lays out the canonical code of a program (§3.2). Static for the life of a block. */
export function buildLayout(program: TypingProgram): Layout {
  const lines: LineModel[] = [];
  const atomStarts: { line: number; cell: number }[] = [];
  let cells: Cell[] = [];
  let autoAtoms: number[] = [];

  program.atoms.forEach((atom, atomIndex) => {
    atomStarts.push({ line: lines.length, cell: cells.length });
    switch (atom.kind) {
      case 'literal':
      case 'padding': {
        const kind = atom.kind;
        Array.from(atom.text).forEach((text, charIndex) => {
          cells.push({ kind, text, atomIndex, charIndex });
        });
        break;
      }
      case 'auto':
        autoAtoms.push(atomIndex);
        Array.from(atom.text).forEach((text, charIndex) => {
          cells.push({ kind: 'auto', text, atomIndex, charIndex, filledBy: atom.filledBy });
        });
        break;
      case 'separator':
        if (atom.canonical === ' ') {
          cells.push({ kind: 'space', text: ' ', atomIndex, charIndex: 0 });
        } else {
          cells.push({ kind: 'eol', text: '', atomIndex, charIndex: 0 });
          lines.push({ cells, autoAtoms });
          cells = [];
          autoAtoms = [];
        }
        break;
    }
  });
  lines.push({ cells, autoAtoms });

  return { lines, atomStarts };
}
