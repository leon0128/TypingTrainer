import type { RomajiAtom, TypingProgram } from '@typing-trainer/contracts';
import { isComplete, type EngineState } from '@typing-trainer/typing-engine';

export type UnitState = 'typed' | 'cursor' | 'pending';

/** One romaji unit as drawn below the text: the keys typed so far, and the spelling still to go. */
export interface UnitView {
  readonly atomIndex: number;
  readonly state: UnitState;
  readonly typed: string;
  readonly rest: string;
}

/**
 * A text shown above the romaji it is read as. The text is the `display` of the unit it starts at,
 * and it spans the units after it that have none (a kanji read with several units, §13.5).
 */
export interface GroupView {
  readonly display: string;
  readonly units: readonly UnitView[];
}

export interface JaLineView {
  readonly groups: readonly GroupView[];
  /** The line break that ends the line (a paragraph's, §13.4); null on the last line. */
  readonly eol: { readonly atomIndex: number; readonly state: UnitState } | null;
}

/**
 * The spelling drawn for a unit: the first one that starts with the keys typed. A spelling the
 * player has left (`shi` after typing `si`) is never shown again, so the rest always matches.
 */
export function spellingFor(atom: RomajiAtom, typed: string): string {
  return (
    atom.alternatives.find((spelling) => spelling.startsWith(typed)) ?? atom.alternatives[0] ?? ''
  );
}

/** The Japanese block as lines of groups, with the state of each unit; `state` null is untouched. */
export function jaLines(program: TypingProgram, state: EngineState | null): JaLineView[] {
  const done = state !== null && isComplete(state);
  const current = state === null || done ? -1 : state.atomIndex;
  const stateOf = (atomIndex: number): UnitState => {
    if (state === null) return 'pending';
    if (done || atomIndex < current) return 'typed';
    return atomIndex === current ? 'cursor' : 'pending';
  };

  const lines: JaLineView[] = [];
  let groups: { display: string; units: UnitView[] }[] = [];
  program.atoms.forEach((atom, atomIndex) => {
    if (atom.kind === 'romaji') {
      const unitState = stateOf(atomIndex);
      const keys = unitState === 'cursor' && state !== null ? state.typed : '';
      // A unit already left is drawn whole in its first spelling: which one was typed is not kept.
      const spelling = spellingFor(atom, keys);
      const unit: UnitView =
        unitState === 'typed'
          ? { atomIndex, state: unitState, typed: atom.alternatives[0] ?? '', rest: '' }
          : { atomIndex, state: unitState, typed: keys, rest: spelling.slice(keys.length) };
      const last = groups.at(-1);
      if (atom.display === '' && last !== undefined) last.units.push(unit);
      else groups.push({ display: atom.display, units: [unit] });
    } else if (atom.kind === 'separator' && atom.canonical === '\n') {
      lines.push({ groups, eol: { atomIndex, state: stateOf(atomIndex) } });
      groups = [];
    }
  });
  lines.push({ groups, eol: null });
  return lines;
}
