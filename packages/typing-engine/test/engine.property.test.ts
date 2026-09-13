import { TypingProgramSchema, type Atom } from '@typing-trainer/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createEngineState, handleKey, isComplete, type EngineState } from '../src';
import {
  PROBE_KEYS,
  correctKeys,
  programArbitrary,
  spacingArbitrary,
  visitedStates,
} from './arbitraries';

const probeKey = fc.constantFrom(...PROBE_KEYS);

function position(state: EngineState) {
  return {
    atomIndex: state.atomIndex,
    charIndex: state.charIndex,
    separatorConsumed: state.separatorConsumed,
  };
}

describe('generated programs', () => {
  it('satisfy TypingProgramSchema', () => {
    fc.assert(
      fc.property(programArbitrary, (program) => {
        expect(TypingProgramSchema.safeParse(program).error?.issues ?? []).toEqual([]);
      }),
    );
  });
});

describe('scoring fairness (§3.5)', () => {
  it('ends with effective === canonicalKeystrokes for any whitespace style', () => {
    fc.assert(
      fc.property(programArbitrary, spacingArbitrary, (program, spacing) => {
        let state = createEngineState(program);
        for (const key of correctKeys(program, spacing)) {
          const result = handleKey(state, key);
          expect(result.verdict).not.toBe('MISS');
          state = result.state;
        }
        expect(isComplete(state)).toBe(true);
        expect(state.counters.effective).toBe(program.canonicalKeystrokes);
        expect(state.counters.miss).toBe(0);
      }),
      { numRuns: 500 },
    );
  });

  it('ends with effective === canonicalKeystrokes whenever arbitrary input completes a block', () => {
    fc.assert(
      fc.property(
        programArbitrary,
        spacingArbitrary,
        fc.array(fc.tuple(fc.nat(), probeKey), { maxLength: 40 }),
        (program, spacing, noise) => {
          const keys = correctKeys(program, spacing);
          for (const [at, key] of noise) keys.splice(at % (keys.length + 1), 0, key);

          let state = createEngineState(program);
          for (const key of keys) {
            const before = state;
            state = handleKey(state, key).state;

            // Cursor never rests on an auto or padding atom, counters never decrease, and a keystroke
            // adds at most one miss.
            if (!isComplete(state)) {
              expect(['auto', 'padding']).not.toContain(program.atoms[state.atomIndex]?.kind);
            }
            expect(state.counters.effective).toBeGreaterThanOrEqual(before.counters.effective);
            expect(state.counters.effective).toBeLessThanOrEqual(program.canonicalKeystrokes);
            expect(state.counters.miss - before.counters.miss).toBeGreaterThanOrEqual(0);
            expect(state.counters.miss - before.counters.miss).toBeLessThanOrEqual(1);
          }
          if (isComplete(state)) {
            expect(state.counters.effective).toBe(program.canonicalKeystrokes);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('miss deduplication (§3.4)', () => {
  it('counts consecutive wrong keys at a literal as one miss (e.g. `for` typed as `or`)', () => {
    fc.assert(
      fc.property(
        programArbitrary,
        spacingArbitrary,
        fc.nat(),
        fc.array(probeKey, { minLength: 1, maxLength: 6 }),
        (program, spacing, pick, candidates) => {
          const atLiteral = visitedStates(program, correctKeys(program, spacing)).filter(
            (state) => program.atoms[state.atomIndex]?.kind === 'literal',
          );
          const start = atLiteral[pick % atLiteral.length];
          if (!start) return;
          const atom = program.atoms[start.atomIndex];
          if (atom?.kind !== 'literal') return;

          const wrongKeys = candidates.filter((key) => key !== atom.text[start.charIndex]);
          fc.pre(wrongKeys.length > 0);

          let state = start;
          for (const key of wrongKeys) {
            const result = handleKey(state, key);
            expect(result.verdict).toBe('MISS');
            state = result.state;
          }
          expect(state.counters.miss).toBe(start.counters.miss + 1);
          expect(position(state)).toEqual(position(start));
        },
      ),
    );
  });

  it('never counts a repeated missed key again at the same position', () => {
    fc.assert(
      fc.property(
        programArbitrary,
        spacingArbitrary,
        fc.nat(),
        probeKey,
        fc.integer({ min: 1, max: 4 }),
        (program, spacing, pick, key, repeats) => {
          const states = visitedStates(program, correctKeys(program, spacing));
          const start = states[pick % states.length];
          if (!start) return;

          const first = handleKey(start, key);
          if (first.verdict !== 'MISS') return;

          let state = first.state;
          for (let i = 0; i < repeats; i += 1) {
            const result = handleKey(state, key);
            expect(result.verdict).toBe('MISS');
            expect(position(result.state)).toEqual(position(first.state));
            expect(result.state.counters.miss).toBe(first.state.counters.miss);
            expect(result.state.counters.effective).toBe(first.state.counters.effective);
            state = result.state;
          }
        },
      ),
    );
  });
});

describe('auto-inserted characters (§3.3.4, Q6, Q30)', () => {
  it('makes typing an already-filled closing bracket a miss', () => {
    fc.assert(
      fc.property(programArbitrary, spacingArbitrary, (program, spacing) => {
        for (const state of visitedStates(program, correctKeys(program, spacing))) {
          if (isComplete(state)) continue;
          program.atoms.forEach((atom, index) => {
            if (atom.kind !== 'auto' || atom.text.startsWith(' ')) return;
            if (index >= state.atomIndex || atom.filledBy >= state.atomIndex) return;
            expect(handleKey(state, atom.text).verdict).toBe('MISS');
          });
        }
      }),
      { numRuns: 200 },
    );
  });

  it('makes Space right after an auto-indented line break a miss', () => {
    fc.assert(
      fc.property(programArbitrary, spacingArbitrary, (program, spacing) => {
        const keys = correctKeys(program, spacing);
        const states = visitedStates(program, keys);
        keys.forEach((key, i) => {
          const before = states[i];
          const after = states[i + 1];
          if (key !== 'Enter' || !before || !after || isComplete(after)) return;
          const indentation = program.atoms[before.atomIndex + 1];
          if (indentation?.kind !== 'auto' || !indentation.text.startsWith(' ')) return;
          // Only when the line starts with a character to type; after an auto `}` a space
          // separator (`} else`) legitimately accepts Space.
          if (program.atoms[after.atomIndex]?.kind !== 'literal') return;
          expect(handleKey(after, ' ').verdict).toBe('MISS');
        });
      }),
      { numRuns: 200 },
    );
  });
});

describe('program generator', () => {
  const isSpace = (atom: Atom | undefined) => atom?.kind === 'separator' && atom.canonical === ' ';
  const isLineBreak = (atom: Atom | undefined) =>
    atom?.kind === 'separator' && atom.canonical === '\n';
  const isCloser = (atom: Atom) => atom.kind === 'auto' && !atom.text.startsWith(' ');

  /** Atoms from `index + 1` up to the next typed atom, and that typed atom. */
  function autosThenNext(atoms: readonly Atom[], index: number) {
    let next = index + 1;
    while (atoms[next]?.kind === 'auto' || atoms[next]?.kind === 'padding') next += 1;
    return { autos: atoms.slice(index + 1, next), next: atoms[next] };
  }

  const shapes: Record<string, (atoms: readonly Atom[]) => boolean> = {
    'space, auto closer, line break': (atoms) =>
      atoms.some((atom, i) => {
        const { autos, next } = autosThenNext(atoms, i);
        return isSpace(atom) && autos.some(isCloser) && isLineBreak(next);
      }),
    'two or more auto closers, line break': (atoms) =>
      atoms.some((atom, i) => {
        const { autos, next } = autosThenNext(atoms, i);
        return atom.kind === 'literal' && autos.filter(isCloser).length >= 2 && isLineBreak(next);
      }),
    'line holding only auto closers': (atoms) =>
      atoms.some((atom, i) => {
        const { autos, next } = autosThenNext(atoms, i);
        return isLineBreak(atom) && autos.some(isCloser) && isLineBreak(next);
      }),
    'space, auto closer, space': (atoms) =>
      atoms.some((atom, i) => {
        const { autos, next } = autosThenNext(atoms, i);
        return isSpace(atom) && autos.some(isCloser) && isSpace(next);
      }),
    'padding before a space separator': (atoms) =>
      atoms.some((atom, i) => atom.kind === 'padding' && isSpace(atoms[i + 1])),
    'ends in an optional space and autos': (atoms) => {
      let lastLiteral = atoms.length - 1;
      while (lastLiteral >= 0 && atoms[lastLiteral]?.kind !== 'literal') lastLiteral -= 1;
      const tail = atoms.slice(lastLiteral + 1);
      return tail.some(isSpace) && !tail.some((atom) => atom.kind === 'separator' && atom.required);
    },
  };

  it.each(Object.keys(shapes))('regularly produces: %s', (name) => {
    const programs = fc.sample(programArbitrary, { numRuns: 1000, seed: 20260913 });
    const matches = programs.filter((program) => shapes[name]?.(program.atoms)).length;
    expect(matches / programs.length).toBeGreaterThan(0.05);
  });
});

describe('accepted keys at separators (§3.3.2, Q8)', () => {
  it('accepts only Enter at a line break and consumes an in-line separator only with Space', () => {
    fc.assert(
      fc.property(programArbitrary, spacingArbitrary, (program, spacing) => {
        for (const state of visitedStates(program, correctKeys(program, spacing))) {
          const atom = program.atoms[state.atomIndex];
          if (atom?.kind !== 'separator') continue;

          for (const key of PROBE_KEYS) {
            const result = handleKey(state, key);

            if (atom.canonical === '\n') {
              if (key === 'Enter') {
                expect(result.verdict).toBe('CORRECT');
                expect(result.state.atomIndex).toBeGreaterThan(state.atomIndex);
              } else {
                expect(result.verdict).toBe('MISS');
                expect(result.state.atomIndex).toBe(state.atomIndex);
              }
              continue;
            }

            if (state.separatorConsumed) continue;

            const consumedHere =
              result.state.atomIndex === state.atomIndex && result.state.separatorConsumed;
            if (key === ' ') {
              expect(result.verdict).toBe('CORRECT');
              expect(consumedHere || isComplete(result.state)).toBe(true);
            } else {
              expect(consumedHere).toBe(false);
            }
            if (key === 'Tab') {
              expect(result.verdict).toBe('MISS');
              expect(result.state.atomIndex).toBe(state.atomIndex);
            }
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
