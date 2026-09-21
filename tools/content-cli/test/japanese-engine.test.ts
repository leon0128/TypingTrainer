import {
  JapaneseCompileError,
  KANA_TABLE,
  compileJapanese,
  kanaSegments,
} from '@typing-trainer/block-compiler';
import { countMaxKeystrokes, type Atom, type TypingProgram } from '@typing-trainer/contracts';
import {
  cpuKeys,
  createEngineState,
  handleKey,
  isComplete,
  type EngineState,
} from '@typing-trainer/typing-engine';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

/**
 * The Japanese compiler's output played through the real engine (§13.5). The compiler decides the
 * units and their spellings, the engine matches keys against them, and the two meet only here: a
 * spelling the compiler offers that the engine cannot follow, or a key the engine accepts that no
 * spelling allows, fails one of these properties. The reference below is written from the
 * definition (the language of a program is every choice of one spelling per unit, joined) and
 * shares no code with the engine.
 */

const KANA_TOKENS = [...KANA_TABLE.keys(), 'ん', 'ん', 'っ', 'ー', '、', '。'];

const linesArbitrary = fc.array(
  fc
    .array(fc.constantFrom(...KANA_TOKENS), { minLength: 1, maxLength: 6 })
    .map((tokens) => tokens.join('')),
  { minLength: 1, maxLength: 3 },
);

/** Compiles the lines, or reports that the random text was not typable (a sokuon before ん, say). */
function compile(lines: readonly string[]): TypingProgram | undefined {
  try {
    return compileJapanese(
      'ja-word/probe',
      lines.map((text) => kanaSegments(text)),
    );
  } catch (error) {
    if (error instanceof JapaneseCompileError && error.code === 'unsupported-sequence') {
      return undefined;
    }
    throw error;
  }
}

const spellingsOf = (atom: Atom): readonly string[] =>
  atom.kind === 'romaji' ? atom.alternatives : atom.kind === 'separator' ? ['\n'] : [];

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

function isMember(units: readonly (readonly string[])[], typed: string, from = 0): boolean {
  const spellings = units[from];
  if (spellings === undefined) return typed === '';
  return spellings.some(
    (spelling) =>
      typed.startsWith(spelling) && isMember(units, typed.slice(spelling.length), from + 1),
  );
}

const toKey = (character: string) => (character === '\n' ? 'Enter' : character);

/** Types every character, expecting each to be right, and returns the final state. */
function typeAll(program: TypingProgram, characters: readonly string[]): EngineState {
  let state = createEngineState(program);
  characters.forEach((character, index) => {
    expect(isComplete(state), `complete before key ${String(index)}`).toBe(false);
    const result = handleKey(state, toKey(character));
    expect(result.verdict, `key ${String(index)} "${character}"`).toBe('CORRECT');
    state = result.state;
  });
  return state;
}

const KEY_ALPHABET = Array.from("abcdefghijklmnopqrstuvwxyz-,.'").concat(['\n', 'S', ' ']);

describe('compiled Japanese, played through the engine', () => {
  it('is completed by the shortest route, which is what the CPU and the Ghost type', () => {
    fc.assert(
      fc.property(linesArbitrary, (lines) => {
        const program = compile(lines);
        fc.pre(program !== undefined);
        const keys = cpuKeys([program]).map((key) => (key === 'Enter' ? '\n' : key));
        const state = typeAll(program, keys);
        expect(isComplete(state)).toBe(true);
        expect(state.counters).toMatchObject({ effective: program.canonicalKeystrokes, miss: 0 });
        expect(keys).toHaveLength(program.canonicalKeystrokes);
      }),
      { numRuns: 500 },
    );
  });

  it('is completed by the longest route, in exactly the keys the ceiling allows', () => {
    fc.assert(
      fc.property(linesArbitrary, (lines) => {
        const program = compile(lines);
        fc.pre(program !== undefined);
        const longest = program.atoms.flatMap((atom) => {
          const spellings = spellingsOf(atom);
          return Array.from(
            spellings.reduce((most, spelling) => (spelling.length > most.length ? spelling : most)),
          );
        });
        const state = typeAll(program, longest);
        expect(isComplete(state)).toBe(true);
        expect(state.counters.effective).toBe(countMaxKeystrokes(program.atoms));
      }),
      { numRuns: 500 },
    );
  });

  it('is completed by any choice of spellings, on the last key and with no miss', () => {
    fc.assert(
      fc.property(
        linesArbitrary,
        fc.array(fc.nat(), { minLength: 64, maxLength: 64 }),
        (lines, picks) => {
          const program = compile(lines);
          fc.pre(program !== undefined);
          const characters = program.atoms.flatMap((atom, index) => {
            const spellings = spellingsOf(atom);
            return Array.from(spellings[(picks[index] ?? 0) % spellings.length] ?? '');
          });
          const state = typeAll(program, characters);
          expect(isComplete(state)).toBe(true);
          expect(state.counters).toMatchObject({ raw: characters.length, miss: 0 });
          expect(characters.length).toBeGreaterThanOrEqual(program.canonicalKeystrokes);
          expect(characters.length).toBeLessThanOrEqual(countMaxKeystrokes(program.atoms));
        },
      ),
      { numRuns: 500 },
    );
  });

  it('judges every key as the definition does, whatever is typed', () => {
    fc.assert(
      fc.property(
        linesArbitrary,
        fc.array(fc.constantFrom(...KEY_ALPHABET), { minLength: 1, maxLength: 60 }),
        (lines, script) => {
          const program = compile(lines);
          fc.pre(program !== undefined);
          // A unit typed in a spelling that another extends (a bare n) is settled by the first key
          // that is not part of a longer spelling, even if that key then misses (§13.5); the
          // reference is told of the settlement and narrows the unit, and judges the rest itself.
          const units = program.atoms.map((atom) => [...spellingsOf(atom)]);
          let state = createEngineState(program);
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
            const settled =
              result.state.atomIndex > state.atomIndex &&
              state.typed !== '' &&
              spellings.includes(state.typed) &&
              !spellings.some((spelling) => spelling.startsWith(state.typed + character));
            if (settled) units[state.atomIndex] = [state.typed];
            state = result.state;
          }
          expect(isComplete(state)).toBe(isMember(units, accepted));
        },
      ),
      { numRuns: 1000 },
    );
  });
});
