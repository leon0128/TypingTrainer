import { countCanonicalKeystrokes, type Atom, type TypingProgram } from '@typing-trainer/contracts';

import { createEngineState, handleKey, type EngineState, type Verdict } from '../src';

export const L = (text: string): Atom => ({ kind: 'literal', text });
export const A = (text: string, filledBy: number): Atom => ({ kind: 'auto', text, filledBy });
export const P = (text: string): Atom => ({ kind: 'padding', text });
export const SP = (required: boolean): Atom => ({ kind: 'separator', canonical: ' ', required });
export const NL: Atom = { kind: 'separator', canonical: '\n', required: true };

/** A romaji unit (§13.5): what is shown above it, and the spellings, the first being displayed. */
export const RM = (display: string, ...alternatives: string[]): Atom => ({
  kind: 'romaji',
  display,
  alternatives,
});

export function program(atoms: Atom[]): TypingProgram {
  return { blockId: 'test', atoms, canonicalKeystrokes: countCanonicalKeystrokes(atoms) };
}

/** Splits a compact key script into keys: `⏎` is Enter, `⇥` is Tab, anything else is itself. */
export function keys(script: string): string[] {
  return Array.from(script).map((char) => (char === '⏎' ? 'Enter' : char === '⇥' ? 'Tab' : char));
}

export interface Playback {
  state: EngineState;
  verdicts: Verdict[];
}

export function play(from: TypingProgram | EngineState, script: string): Playback {
  let state = 'atoms' in from ? createEngineState(from) : from;
  const verdicts: Verdict[] = [];
  for (const key of keys(script)) {
    const result = handleKey(state, key);
    state = result.state;
    verdicts.push(result.verdict);
  }
  return { state, verdicts };
}
