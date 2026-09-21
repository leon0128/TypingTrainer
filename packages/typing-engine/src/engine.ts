import type { Atom, LiteralAtom, TypingProgram } from '@typing-trainer/contracts';

/** Outcome of a single keystroke. Program completion is reported by `isComplete`. */
export type Verdict = 'CORRECT' | 'MISS' | 'IGNORED';

export interface KeystrokeCounters {
  /** Every key handled while the program was incomplete. */
  readonly raw: number;
  /** Keystrokes that advanced the cursor, plus credited separators (§3.5). */
  readonly effective: number;
  /** Incorrect keystrokes, deduplicated per cursor position. */
  readonly miss: number;
  /** Repeated spaces at an already-consumed separator. */
  readonly ignored: number;
}

export interface EngineState {
  readonly program: TypingProgram;
  /** Index of the current atom. Never an auto or padding atom; `atoms.length` once complete. */
  readonly atomIndex: number;
  /**
   * Character offset inside the current literal atom, or the number of keys typed in the current
   * romaji unit (`typed.length`).
   */
  readonly charIndex: number;
  /**
   * The keys typed so far in the current romaji unit (§13.5); empty in any other atom. A unit is
   * left as soon as the keys typed are a spelling no other spelling extends, or when the next key
   * is not part of any longer spelling.
   */
  readonly typed: string;
  /** Whether a space has been consumed at the current in-line separator. */
  readonly separatorConsumed: boolean;
  /** Whether a miss has already been recorded at the current cursor position. */
  readonly missMarkedHere: boolean;
  readonly counters: KeystrokeCounters;
}

export interface KeyResult {
  readonly state: EngineState;
  readonly verdict: Verdict;
}

export const ENTER_KEY = 'Enter';
export const SPACE_KEY = ' ';
export const TAB_KEY = 'Tab';

/** Mutable working copy used inside a single `handleKey` call. */
interface Draft {
  readonly atoms: readonly Atom[];
  atomIndex: number;
  charIndex: number;
  typed: string;
  separatorConsumed: boolean;
  missMarkedHere: boolean;
  raw: number;
  effective: number;
  miss: number;
  ignored: number;
}

/** Auto and padding atoms are never typed; the cursor skips them and they add no keystrokes. */
export function isUntypedAtom(atom: Atom | undefined): boolean {
  return atom?.kind === 'auto' || atom?.kind === 'padding';
}

/** Turns every closing auto atom into a literal, and counts its characters as keystrokes. */
export function withTypedClosers(program: TypingProgram): TypingProgram {
  const isCloser = (atom: Atom) => atom.kind === 'auto' && atom.text.trim() !== '';
  if (!program.atoms.some(isCloser)) return program;
  let added = 0;
  const atoms = program.atoms.map((atom): Atom => {
    if (atom.kind !== 'auto' || !isCloser(atom)) return atom;
    added += atom.text.length;
    return { kind: 'literal', text: atom.text };
  });
  return { ...program, atoms, canonicalKeystrokes: program.canonicalKeystrokes + added };
}

export function createEngineState(program: TypingProgram): EngineState {
  const draft: Draft = {
    atoms: program.atoms,
    atomIndex: 0,
    charIndex: 0,
    typed: '',
    separatorConsumed: false,
    missMarkedHere: false,
    raw: 0,
    effective: 0,
    miss: 0,
    ignored: 0,
  };
  settle(draft);
  return toState(program, draft);
}

export function isComplete(state: EngineState): boolean {
  return state.atomIndex >= state.program.atoms.length;
}

/**
 * Applies one normalized key (a printable character, `Enter`, or `Tab`) and returns the next
 * state. The input state is never modified. See docs/requirements.md §3.4 for the
 * separator transition table this implements.
 */
export function handleKey(state: EngineState, key: string): KeyResult {
  if (isComplete(state)) return { state, verdict: 'IGNORED' };

  const draft: Draft = {
    atoms: state.program.atoms,
    atomIndex: state.atomIndex,
    charIndex: state.charIndex,
    typed: state.typed,
    separatorConsumed: state.separatorConsumed,
    missMarkedHere: state.missMarkedHere,
    ...state.counters,
  };
  draft.raw += 1;
  const verdict = dispatch(draft, key);
  return { state: toState(state.program, draft), verdict };
}

function dispatch(d: Draft, key: string): Verdict {
  for (;;) {
    const atom = d.atoms[d.atomIndex];
    // settle() never leaves the cursor on an auto or padding atom, and a pass-through never runs past
    // the end: if everything after a passable separator were passable, settle() would
    // already have completed the program.
    if (atom === undefined || atom.kind === 'auto' || atom.kind === 'padding') {
      throw new Error(`Engine invariant violated at atom ${String(d.atomIndex)}`);
    }

    if (atom.kind === 'romaji') {
      const typed = d.typed + key;
      if (atom.alternatives.some((spelling) => spelling.startsWith(typed))) {
        // Every key pressed counts, whichever spelling it belongs to (§13.5).
        d.effective += 1;
        d.typed = typed;
        d.charIndex = typed.length;
        d.missMarkedHere = false;
        const finished = atom.alternatives.includes(typed);
        const extendable = atom.alternatives.some(
          (spelling) => spelling.length > typed.length && spelling.startsWith(typed),
        );
        if (finished && !extendable) advanceAtom(d);
        return 'CORRECT';
      }
      if (d.typed !== '' && atom.alternatives.includes(d.typed)) {
        // The spelling typed is complete and the key is not part of a longer one: the unit is
        // done, and the key is judged at the next atom (`n` of んか, then `k`).
        advanceAtom(d);
        continue;
      }
      return markMiss(d);
    }

    if (atom.kind === 'literal') {
      if (key !== atom.text[d.charIndex]) return markMiss(d);
      d.effective += 1;
      advanceChar(d, atom);
      return 'CORRECT';
    }

    if (atom.canonical === '\n') {
      if (key !== ENTER_KEY) return markMiss(d);
      d.effective += 1;
      advanceAtom(d);
      return 'CORRECT';
    }

    const next = nextTypedAtom(d);

    if (d.separatorConsumed) {
      if (key === SPACE_KEY && !(next?.kind === 'separator' && next.canonical === ' ')) {
        d.ignored += 1;
        return 'IGNORED';
      }
      // Already credited when consumed.
      advanceAtom(d);
      continue;
    }

    if (key === SPACE_KEY) {
      d.effective += 1;
      d.separatorConsumed = true;
      settle(d);
      return 'CORRECT';
    }
    if (atom.required || key === TAB_KEY) return markMiss(d);
    if (key === ENTER_KEY && next?.kind !== 'separator') return markMiss(d);

    // Optional separator skipped: still credited (§3.5).
    d.effective += 1;
    advanceAtom(d);
  }
}

function markMiss(d: Draft): Verdict {
  if (!d.missMarkedHere) {
    d.miss += 1;
    d.missMarkedHere = true;
  }
  return 'MISS';
}

function advanceChar(d: Draft, literal: LiteralAtom): void {
  d.charIndex += 1;
  d.missMarkedHere = false;
  if (d.charIndex >= literal.text.length) advanceAtom(d);
}

function advanceAtom(d: Draft): void {
  d.atomIndex += 1;
  d.charIndex = 0;
  d.typed = '';
  d.separatorConsumed = false;
  d.missMarkedHere = false;
  settle(d);
}

/**
 * Normalizes the cursor: skips every auto and padding atom, and if only such atoms and passable
 * separators remain, passes them all (crediting unconsumed ones) so the program completes
 * without an extra keystroke.
 */
function settle(d: Draft): void {
  const start = d.atomIndex;
  while (isUntypedAtom(d.atoms[d.atomIndex])) d.atomIndex += 1;

  if (d.atomIndex < d.atoms.length && hasPassableTail(d)) {
    for (let index = d.atomIndex; index < d.atoms.length; index += 1) {
      const alreadyCredited = index === d.atomIndex && d.separatorConsumed;
      if (d.atoms[index]?.kind === 'separator' && !alreadyCredited) d.effective += 1;
    }
    d.atomIndex = d.atoms.length;
    d.charIndex = 0;
    d.typed = '';
    d.separatorConsumed = false;
  }

  if (d.atomIndex !== start) d.missMarkedHere = false;
}

function hasPassableTail(d: Draft): boolean {
  for (let index = d.atomIndex; index < d.atoms.length; index += 1) {
    const atom = d.atoms[index];
    if (atom === undefined || atom.kind === 'auto' || atom.kind === 'padding') continue;
    if (atom.kind === 'literal' || atom.kind === 'romaji') return false;
    const consumed = index === d.atomIndex && d.separatorConsumed;
    if (atom.required && !consumed) return false;
  }
  return true;
}

function nextTypedAtom(d: Draft): Atom | undefined {
  let index = d.atomIndex + 1;
  while (isUntypedAtom(d.atoms[index])) index += 1;
  return d.atoms[index];
}

function toState(program: TypingProgram, d: Draft): EngineState {
  return {
    program,
    atomIndex: d.atomIndex,
    charIndex: d.charIndex,
    typed: d.typed,
    separatorConsumed: d.separatorConsumed,
    missMarkedHere: d.missMarkedHere,
    counters: { raw: d.raw, effective: d.effective, miss: d.miss, ignored: d.ignored },
  };
}
