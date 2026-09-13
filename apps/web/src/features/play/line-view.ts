import { isComplete, type EngineState } from '@typing-trainer/typing-engine';

import type { Layout, LineModel } from './layout';

/**
 * Per-line render input. Every field is a primitive, so a memoized line re-renders only when one
 * of them changes: usually just the caret line, plus any line whose auto-inserted closer was
 * filled by the keystroke (typing `{` fills a `}` several lines below).
 */
export interface LineView {
  /** Non-auto cells before this index are typed. */
  readonly typedUntil: number;
  /** Whether the caret sits on this line, at cell `typedUntil`. */
  readonly cursorHere: boolean;
  /** Comma-joined indices of this line's auto atoms that are filled. */
  readonly filledAutoKey: string;
}

export type CellState = 'typed' | 'cursor' | 'pending' | 'auto-filled' | 'auto-pending';

/**
 * The caret position: the current atom and character, except that after a consumed space
 * separator the caret is drawn on the next typed atom (the space is already typed). Null once
 * the program is complete.
 */
export function caretOf(state: EngineState): { atomIndex: number; charIndex: number } | null {
  if (isComplete(state)) return null;
  const { atoms } = state.program;
  if (!state.separatorConsumed) return { atomIndex: state.atomIndex, charIndex: state.charIndex };
  let next = state.atomIndex + 1;
  while (atoms[next]?.kind === 'auto') next += 1;
  return { atomIndex: next, charIndex: 0 };
}

export function lineViews(layout: Layout, state: EngineState): LineView[] {
  // A complete program has no caret: every line lies before it.
  let caretLine = Number.POSITIVE_INFINITY;
  let caretColumn = 0;
  const caret = caretOf(state);
  if (caret) {
    const start = layout.atomStarts[caret.atomIndex];
    if (start) {
      caretLine = start.line;
      caretColumn = start.cell + caret.charIndex;
    }
  }
  const { atoms } = state.program;

  return layout.lines.map((line, index) => ({
    typedUntil: index < caretLine ? line.cells.length : index === caretLine ? caretColumn : 0,
    cursorHere: index === caretLine,
    filledAutoKey: line.autoAtoms
      .filter((atomIndex) => {
        const atom = atoms[atomIndex];
        return atom?.kind === 'auto' && state.atomIndex > atom.filledBy;
      })
      .join(','),
  }));
}

/** The §8.1 presentation state of every cell on a line. */
export function cellStates(line: LineModel, view: LineView): CellState[] {
  const filled = new Set(
    view.filledAutoKey === '' ? [] : view.filledAutoKey.split(',').map(Number),
  );
  return line.cells.map((cell, index) => {
    if (cell.kind === 'auto') return filled.has(cell.atomIndex) ? 'auto-filled' : 'auto-pending';
    if (index < view.typedUntil) return 'typed';
    if (view.cursorHere && index === view.typedUntil) return 'cursor';
    return 'pending';
  });
}
