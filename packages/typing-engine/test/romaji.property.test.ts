import { TypingProgramSchema, countMaxKeystrokes, type Atom } from '@typing-trainer/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createEngineState, handleKey, isComplete, type EngineState } from '../src';
import { NL, RM, program } from './helpers';

/**
 * Programs shaped like the compiler's output (§13.5), built here by hand so the engine is checked
 * against a reference that shares no code with it: the language of a program is every way of
 * choosing one spelling per unit and joining them, and a key is right exactly when it keeps what
 * has been typed a prefix of that language.
 */

/** The unit templates: a shown text, and its spellings (the first is displayed). */
const PLAIN: readonly (readonly [string, readonly string[]])[] = [
  ['あ', ['a']],
  ['か', ['ka']],
  ['し', ['shi', 'si']],
  ['しゃ', ['sha', 'sya']],
  ['ち', ['chi', 'ti']],
  ['じゃ', ['ja', 'jya', 'zya']],
  ['な', ['na']],
  ['や', ['ya']],
  ['ー', ['-']],
  ['、', [',']],
  ['っか', ['kka', 'xtuka', 'ltuka', 'xtsuka', 'ltsuka']],
  [
    'っし',
    ['sshi', 'ssi', 'xtushi', 'xtusi', 'ltushi', 'ltusi', 'xtsushi', 'xtsusi', 'ltsushi', 'ltsusi'],
  ],
  ['っあ', ['xtua', 'ltua', 'xtsua', 'ltsua']],
];
const HATSUON = 'HATSUON';
const CHOICES = [...PLAIN.map((_, index) => index), HATSUON] as const;

type Line = readonly (typeof CHOICES)[number][];

/** ん is spelled `n` alone only when a unit follows on the line and none of its spellings starts
 * with a vowel, n, or y (§13.5). */
function hatsuon(next: readonly string[] | undefined): readonly string[] {
  const bare = next?.every((spelling) => !/^[aiueony]/.test(spelling)) === true;
  return bare ? ['n', 'nn', "n'", 'xn'] : ['nn', "n'", 'xn'];
}

interface Built {
  readonly atoms: Atom[];
  /** One spelling set per unit, with `['\n']` for a line break. */
  readonly units: (readonly string[])[];
}

function build(lines: readonly Line[]): Built {
  const atoms: Atom[] = [];
  const units: (readonly string[])[] = [];
  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) {
      atoms.push(NL);
      units.push(['\n']);
    }
    const spellings: (readonly string[])[] = [];
    for (let index = line.length - 1; index >= 0; index -= 1) {
      const choice = line[index];
      const template = typeof choice === 'number' ? PLAIN[choice] : undefined;
      spellings.unshift(template === undefined ? hatsuon(spellings[0]) : template[1]);
    }
    line.forEach((choice, index) => {
      const template = typeof choice === 'number' ? PLAIN[choice] : undefined;
      atoms.push(RM(template?.[0] ?? 'ん', ...(spellings[index] ?? [])));
      units.push(spellings[index] ?? []);
    });
  });
  return { atoms, units };
}

const lineArbitrary = fc.array(fc.constantFrom(...CHOICES), { minLength: 1, maxLength: 5 });
const linesArbitrary = fc.array(lineArbitrary, { minLength: 1, maxLength: 3 });

/** Whether `typed` is the start of some string of the language of `units`. */
function isPrefix(units: readonly (readonly string[])[], typed: string, from = 0): boolean {
  if (typed === '') return true;
  const spellings = units[from];
  if (spellings === undefined) return false;
  return spellings.some((spelling) =>
    typed.length <= spelling.length
      ? spelling.startsWith(typed)
      : typed.startsWith(spelling) && isPrefix(units, typed.slice(spelling.length), from + 1),
  );
}

/** Whether `typed` is exactly a string of the language of `units`. */
function isMember(units: readonly (readonly string[])[], typed: string, from = 0): boolean {
  const spellings = units[from];
  if (spellings === undefined) return typed === '';
  return spellings.some(
    (spelling) =>
      typed.startsWith(spelling) && isMember(units, typed.slice(spelling.length), from + 1),
  );
}

const toKey = (character: string) => (character === '\n' ? 'Enter' : character);

/** Keys that occur in the spellings, plus keys that never do. */
const KEY_ALPHABET = Array.from("aiueokstnhmyrwgzdbpfjcxl-,.' ").concat(['\n', 'S', '\t']);

describe('generated Japanese programs', () => {
  it('satisfy TypingProgramSchema, with a canonical length no greater than the longest route', () => {
    fc.assert(
      fc.property(linesArbitrary, (lines) => {
        const p = program(build(lines).atoms);
        expect(TypingProgramSchema.safeParse(p).success).toBe(true);
        expect(p.canonicalKeystrokes).toBeLessThanOrEqual(countMaxKeystrokes(p.atoms));
      }),
      { numRuns: 500 },
    );
  });

  it('are completed by any way of spelling them, on the last key and with no miss', () => {
    fc.assert(
      fc.property(
        linesArbitrary,
        fc.array(fc.nat(), { minLength: 64, maxLength: 64 }),
        (lines, picks) => {
          const { atoms, units } = build(lines);
          const p = program(atoms);
          const typed = units.map(
            (spellings, index) => spellings[(picks[index] ?? 0) % spellings.length] ?? '',
          );
          const all = Array.from(typed.join(''));
          let state: EngineState = createEngineState(p);
          all.forEach((character, index) => {
            expect(isComplete(state), `complete before key ${String(index)}`).toBe(false);
            const result = handleKey(state, toKey(character));
            expect(result.verdict).toBe('CORRECT');
            state = result.state;
          });
          expect(isComplete(state)).toBe(true);
          expect(state.counters).toMatchObject({ raw: all.length, effective: all.length, miss: 0 });
          expect(all.length).toBeGreaterThanOrEqual(p.canonicalKeystrokes);
          expect(all.length).toBeLessThanOrEqual(countMaxKeystrokes(atoms));
        },
      ),
      { numRuns: 500 },
    );
  });

  it('judge every key as the reference does: right only if what is typed stays a prefix', () => {
    fc.assert(
      fc.property(
        linesArbitrary,
        fc.array(fc.constantFrom(...KEY_ALPHABET), { minLength: 1, maxLength: 60 }),
        (lines, script) => {
          const { atoms, units: built } = build(lines);
          // A unit whose spelling is complete but could be longer (a bare n) is settled by the
          // first key that is not part of a longer spelling, even when that key then misses at the
          // next unit (§13.5). The reference learns of such a settlement from the engine and
          // narrows that unit to the spelling typed; everything else it judges on its own.
          const units = built.map((spellings) => [...spellings]);
          let state = createEngineState(program(atoms));
          let accepted = '';
          for (const character of script) {
            if (isComplete(state)) break;
            const result = handleKey(state, toKey(character));
            const expected = isPrefix(units, accepted + character);
            expect(result.verdict, `"${accepted}" then "${character}"`).toBe(
              expected ? 'CORRECT' : 'MISS',
            );
            if (expected) accepted += character;
            const spellings = units[state.atomIndex] ?? [];
            const settledByThisKey =
              result.state.atomIndex > state.atomIndex &&
              state.typed !== '' &&
              spellings.includes(state.typed) &&
              !spellings.some((spelling) => spelling.startsWith(state.typed + character));
            if (settledByThisKey) units[state.atomIndex] = [state.typed];
            state = result.state;
          }
          expect(isComplete(state)).toBe(isMember(units, accepted));
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('count a wrong key once at a position, however often it repeats', () => {
    fc.assert(
      fc.property(
        linesArbitrary,
        fc.array(fc.constantFrom(...KEY_ALPHABET), { maxLength: 12 }),
        fc.constantFrom('S', 'q', 'Tab', ' '),
        fc.integer({ min: 2, max: 6 }),
        (lines, script, wrong, repeats) => {
          const { atoms, units } = build(lines);
          let state = createEngineState(program(atoms));
          let accepted = '';
          for (const character of script) {
            if (isComplete(state)) return;
            const result = handleKey(state, toKey(character));
            if (isPrefix(units, accepted + character)) accepted += character;
            state = result.state;
          }
          if (isComplete(state)) return;
          const before = state;
          const first = handleKey(before, wrong);
          expect(first.verdict).toBe('MISS');
          let after = first.state;
          for (let count = 1; count < repeats; count += 1) after = handleKey(after, wrong).state;
          // The first wrong key may end a unit whose spelling was already complete (a bare n) and
          // be judged at the next one; after that nothing changes however often it is repeated.
          const settled = (state: EngineState) => ({
            ...state,
            counters: { ...state.counters, raw: 0 },
          });
          expect(settled(after)).toEqual(settled(first.state));
          expect(first.state.counters.miss).toBeLessThanOrEqual(before.counters.miss + 1);
          expect(first.state.counters.effective).toBe(before.counters.effective);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('never throw and never lose count, whatever is typed', () => {
    fc.assert(
      fc.property(
        linesArbitrary,
        fc.array(fc.constantFrom(...KEY_ALPHABET, 'Enter', 'Tab'), { maxLength: 80 }),
        (lines, script) => {
          let state = createEngineState(program(build(lines).atoms));
          for (const key of script) {
            const next = handleKey(state, key).state;
            expect(next.counters.raw).toBeGreaterThanOrEqual(state.counters.raw);
            expect(next.counters.effective).toBeGreaterThanOrEqual(state.counters.effective);
            expect(next.counters.miss).toBeGreaterThanOrEqual(state.counters.miss);
            state = next;
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
