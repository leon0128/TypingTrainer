import {
  countMaxKeystrokes,
  shortestSpelling as contractsShortestSpelling,
  type Atom,
} from '@typing-trainer/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { maxKeystrokes, shortestSpelling } from '../src/keystrokes';
import { RM } from './helpers';

const spelling = fc.string({
  unit: fc.constantFrom(...Array.from("abcnstx'-,.")),
  minLength: 1,
  maxLength: 6,
});
const romaji = fc
  .uniqueArray(spelling, { minLength: 1, maxLength: 5 })
  .map((spellings): Atom => RM('x', ...spellings));
const atom: fc.Arbitrary<Atom> = fc.oneof(
  romaji,
  fc.string({ minLength: 1, maxLength: 5 }).map((text): Atom => ({ kind: 'literal', text })),
  fc.constantFrom<Atom>(
    { kind: 'separator', canonical: '\n', required: true },
    { kind: 'separator', canonical: ' ', required: false },
  ),
);

describe('the engine and contracts count keystrokes alike', () => {
  it('agree on the longest way to type any atoms', () => {
    fc.assert(
      fc.property(fc.array(atom, { maxLength: 12 }), (atoms) => {
        expect(maxKeystrokes(atoms)).toBe(countMaxKeystrokes(atoms));
      }),
      { numRuns: 500 },
    );
  });

  it('agree on the shortest spelling of a unit, the first when several are as short', () => {
    fc.assert(
      fc.property(romaji, (unit) => {
        if (unit.kind !== 'romaji') throw new Error('generated a romaji unit');
        expect(shortestSpelling(unit)).toBe(contractsShortestSpelling(unit));
      }),
      { numRuns: 500 },
    );
    const tie = { kind: 'romaji', display: 'じ', alternatives: ['ji', 'zi'] } as const;
    expect(shortestSpelling({ ...tie, alternatives: [...tie.alternatives] })).toBe('ji');
  });
});
