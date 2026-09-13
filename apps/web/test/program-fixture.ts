import type { Atom, TypingProgram } from '@typing-trainer/contracts';
import { createEngineState, handleKey, type EngineState } from '@typing-trainer/typing-engine';

/**
 * ```ts
 * if (a) {
 *   b
 * }
 * ```
 */
export const IF_PROGRAM: TypingProgram = {
  blockId: 'if-program',
  atoms: [
    { kind: 'literal', text: 'if' }, //                                  0
    { kind: 'separator', canonical: ' ', required: false }, //           1
    { kind: 'literal', text: '(' }, //                                   2
    { kind: 'literal', text: 'a' }, //                                   3
    { kind: 'auto', text: ')', filledBy: 2 }, //                         4
    { kind: 'separator', canonical: ' ', required: false }, //           5
    { kind: 'literal', text: '{' }, //                                   6
    { kind: 'separator', canonical: '\n', required: true }, //           7
    { kind: 'auto', text: '  ', filledBy: 7 }, //                        8
    { kind: 'literal', text: 'b' }, //                                   9
    { kind: 'separator', canonical: '\n', required: true }, //          10
    { kind: 'auto', text: '}', filledBy: 6 }, //                        11
  ] satisfies Atom[],
  canonicalKeystrokes: 10,
};

/** Plays a compact key script: `⏎` is Enter, anything else is itself. */
export function typed(program: TypingProgram, script: string): EngineState {
  let state = createEngineState(program);
  for (const char of Array.from(script)) {
    state = handleKey(state, char === '⏎' ? 'Enter' : char).state;
  }
  return state;
}
