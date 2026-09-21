import { createEngineState, handleKey, isComplete } from '@typing-trainer/typing-engine';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { compileEnglish } from '../src';

/** English compiled by the pipeline, played through the real engine (§13.6). */

const word = fc
  .array(fc.constantFrom(...Array.from('abcdefghijklmnopqrstuvwxyzABC')), {
    minLength: 1,
    maxLength: 8,
  })
  .map((letters) => letters.join(''));
const punctuated = fc
  .tuple(word, fc.constantFrom('', '', ',', '.'))
  .map(([text, mark]) => `${text}${mark}`);
const lineArbitrary = fc
  .array(punctuated, { minLength: 1, maxLength: 8 })
  .map((words) => words.join(' '));
const linesArbitrary = fc.array(lineArbitrary, { minLength: 1, maxLength: 4 });

const keysOf = (lines: readonly string[]): string[] =>
  lines.flatMap((line, index) => [...(index > 0 ? ['Enter'] : []), ...Array.from(line)]);

describe('compiled English, played through the engine', () => {
  it('is completed by typing the text, in exactly its keystrokes and with no miss', () => {
    fc.assert(
      fc.property(linesArbitrary, (lines) => {
        const program = compileEnglish('en-paragraph/probe', lines);
        let state = createEngineState(program);
        const keys = keysOf(lines);
        keys.forEach((key, index) => {
          expect(isComplete(state), `complete before key ${String(index)}`).toBe(false);
          const result = handleKey(state, key);
          expect(result.verdict).toBe('CORRECT');
          state = result.state;
        });
        expect(isComplete(state)).toBe(true);
        expect(state.counters).toMatchObject({ raw: keys.length, effective: keys.length, miss: 0 });
        expect(program.canonicalKeystrokes).toBe(keys.length);
      }),
      { numRuns: 500 },
    );
  });

  it('misses a wrong letter, a missing space, and Enter where a space is due', () => {
    const program = compileEnglish('en-line/probe', ['ab cd']);
    const play = (script: string[]) => {
      let state = createEngineState(program);
      const verdicts = script.map((key) => {
        const result = handleKey(state, key);
        state = result.state;
        return result.verdict;
      });
      return { state, verdicts };
    };
    expect(play(['a', 'x']).verdicts).toEqual(['CORRECT', 'MISS']);
    expect(play(['a', 'b', 'c']).verdicts).toEqual(['CORRECT', 'CORRECT', 'MISS']);
    expect(play(['a', 'b', 'Enter']).verdicts).toEqual(['CORRECT', 'CORRECT', 'MISS']);
    expect(play(['A']).verdicts).toEqual(['MISS']);
  });

  it('counts a repeated space once, as it does for code', () => {
    const program = compileEnglish('en-line/probe', ['ab cd']);
    let state = createEngineState(program);
    const verdicts = ['a', 'b', ' ', ' ', 'c', 'd'].map((key) => {
      const result = handleKey(state, key);
      state = result.state;
      return result.verdict;
    });
    expect(verdicts).toEqual(['CORRECT', 'CORRECT', 'CORRECT', 'IGNORED', 'CORRECT', 'CORRECT']);
    expect(isComplete(state)).toBe(true);
    expect(state.counters.effective).toBe(program.canonicalKeystrokes);
  });
});
