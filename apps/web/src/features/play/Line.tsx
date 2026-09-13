import { memo } from 'react';

import type { LineModel } from './layout';
import { cellStates, type CellState } from './line-view';

interface LineProps {
  readonly line: LineModel;
  readonly typedUntil: number;
  readonly cursorHere: boolean;
  readonly filledAutoKey: string;
  /** Non-zero restarts the miss flash on the caret; changes only on this line's misses. */
  readonly flashSeq: number;
}

interface Segment {
  state: CellState;
  blank: boolean;
  text: string;
  start: number;
}

/**
 * One line of code. Memoized on primitive props, so a keystroke re-renders only the lines whose
 * caret position or filled closers changed (§3.7, R2). Runs of cells in the same state share a
 * span to keep the DOM small.
 */
export const Line = memo(function Line({
  line,
  typedUntil,
  cursorHere,
  filledAutoKey,
  flashSeq,
}: LineProps) {
  const states = cellStates(line, { typedUntil, cursorHere, filledAutoKey });

  const segments: Segment[] = [];
  line.cells.forEach((cell, index) => {
    const state = states[index] ?? 'pending';
    const text = cell.kind === 'eol' ? (state === 'cursor' ? '↵' : '') : cell.text;
    const blank = text.trim() === '';
    const last = segments.at(-1);
    if (last && state !== 'cursor' && last.state === state && last.blank === blank) {
      last.text += text;
    } else {
      segments.push({ state, blank, text, start: index });
    }
  });

  return (
    <div className="code-line">
      {segments.map((segment) =>
        segment.state === 'cursor' ? (
          <span
            key={`cursor-${String(flashSeq)}`}
            className={flashSeq > 0 ? 'cell cell-cursor miss-flash' : 'cell cell-cursor'}
          >
            {segment.text}
          </span>
        ) : (
          <span
            key={segment.start}
            className={`cell cell-${segment.state}${segment.blank ? ' cell-blank' : ''}`}
          >
            {segment.text}
          </span>
        ),
      )}
    </div>
  );
});
