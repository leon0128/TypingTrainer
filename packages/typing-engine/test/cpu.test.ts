import type { Atom, TypingProgram } from '@typing-trainer/contracts';
import { describe, expect, it } from 'vitest';

import {
  CPU_MAX_LEVEL,
  PLAY_DURATION_MS,
  cpuBaseKpm,
  cpuBlockMultipliers,
  cpuEffectiveKeystrokes,
  cpuKeys,
  cpuScore,
  cpuTimeline,
  createSeededRandom,
  createSession,
  judgeMatch,
  keyCost,
  sessionCounters,
  sessionKey,
} from '../src';
import { L, NL, SP, program } from './helpers';

const TOKENS = [
  'const',
  'x',
  '=',
  'foo(',
  'bar',
  '[0]',
  '"s"',
  'A_B',
  '{',
  '}',
  ';',
  '.',
  '->',
  '42',
];

/** Twenty blocks mixing every key class (letters, digits, shifted and other symbols, separators). */
function syntheticPrograms(seed: bigint): TypingProgram[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: 20 }, () => {
    const atoms: Atom[] = [];
    for (let line = 0; line < 8; line += 1) {
      for (let token = 0; token < 6; token += 1) {
        atoms.push(L(TOKENS[random.nextInt(TOKENS.length)] ?? 'x'));
        if (token < 5) atoms.push(SP(true));
      }
      atoms.push(NL);
    }
    return program(atoms);
  });
}

describe('cpuBaseKpm', () => {
  it('matches the §4.3.2 table', () => {
    const table: [number, number][] = [
      [1, 50],
      [10, 64],
      [20, 85],
      [30, 113],
      [40, 149],
      [48, 186], // §4.3.2 prints 185; the formula gives 186.4 (corrected in spec v1.21)
      [50, 197],
      [60, 261],
      [70, 345],
      [80, 457],
      [90, 605],
      [100, 800],
    ];
    for (const [level, kpm] of table) expect(Math.round(cpuBaseKpm(level))).toBe(kpm);
  });

  it('refuses levels outside 1 to 100 and non-integers', () => {
    for (const level of [0, 101, 1.5, Number.NaN, -3]) {
      expect(() => cpuBaseKpm(level)).toThrow(RangeError);
    }
  });
});

describe('keyCost', () => {
  it('follows the §4.3.3 weights', () => {
    expect(keyCost('a')).toBe(1);
    expect(keyCost('7')).toBe(1);
    expect(keyCost('A')).toBe(1.5);
    expect(keyCost('(')).toBe(1.5);
    expect(keyCost('_')).toBe(1.5);
    expect(keyCost('[')).toBe(1.3);
    expect(keyCost(';')).toBe(1.3);
    expect(keyCost('Enter')).toBe(0.8);
    expect(keyCost(' ')).toBe(0.8);
  });
});

describe('cpuKeys', () => {
  it('lists literals, separators, and typed closing brackets, skipping only indentation', () => {
    const block = program([
      L('f('),
      { kind: 'auto', text: ')', filledBy: 0 },
      SP(true),
      L('x'),
      NL,
    ]);
    expect(cpuKeys([block])).toEqual(['f', '(', ')', ' ', 'x', 'Enter']);
    expect(cpuKeys([block])).toHaveLength(block.canonicalKeystrokes + 1);
  });
});

describe('cpuTimeline', () => {
  const programs = syntheticPrograms(7n);

  it('is deterministic for a seed and level, and increasing', () => {
    const first = cpuTimeline(programs, 48, 99n);
    const second = cpuTimeline(programs, 48, 99n);
    expect(Array.from(second)).toEqual(Array.from(first));
    for (let index = 1; index < first.length; index += 1) {
      expect(first[index]).toBeGreaterThan(first[index - 1] ?? Infinity);
    }
    expect(first).toHaveLength(cpuKeys(programs).length);
  });

  it('differs between seeds', () => {
    expect(Array.from(cpuTimeline(programs, 48, 1n))).not.toEqual(
      Array.from(cpuTimeline(programs, 48, 2n)),
    );
  });

  it('keeps the seed-to-run mapping stable across releases', () => {
    // Pinned: stored matches are re-judged from their seed, so the model must not drift.
    const timeline = cpuTimeline(programs, 48, 42n);
    expect(cpuEffectiveKeystrokes(timeline)).toMatchInlineSnapshot(`367`);
    expect(cpuScore(timeline)).toMatchInlineSnapshot(`184`);
  });

  it('holds the target speed on average despite the jitter and the cost weights', () => {
    // Over many seeds the mean score must sit on the level's base KPM: a jitter median of 1 would
    // read about 2% fast, and un-normalized cost weights would read about 8% slow.
    for (const level of [1, 48, 100]) {
      let total = 0;
      const runs = 300;
      for (let seed = 1; seed <= runs; seed += 1) {
        const long = syntheticPrograms(BigInt(seed));
        total += cpuScore(cpuTimeline(long, level, BigInt(seed)));
      }
      const mean = total / runs;
      const base = cpuBaseKpm(level);
      expect(Math.abs(mean - base) / base).toBeLessThan(0.01);
    }
  });

  it('draws every block multiplier inside ±6% with a 2% spread around 1', () => {
    const multipliers = cpuBlockMultipliers(100_000, 11n);
    expect(Math.min(...multipliers)).toBeGreaterThanOrEqual(0.94);
    expect(Math.max(...multipliers)).toBeLessThanOrEqual(1.06);
    const mean = multipliers.reduce((sum, value) => sum + value, 0) / multipliers.length;
    const variance =
      multipliers.reduce((sum, value) => sum + (value - mean) ** 2, 0) / multipliers.length;
    expect(Math.abs(mean - 1)).toBeLessThan(0.001);
    // A σ of 2% cut at ±3σ has a standard deviation of about 1.97%.
    expect(Math.sqrt(variance)).toBeGreaterThan(0.0185);
    expect(Math.sqrt(variance)).toBeLessThan(0.0205);
  });

  it('reproduces the exact keys through the real engine: effective equals the timeline count', () => {
    const timeline = cpuTimeline(programs, 60, 5n);
    const keys = cpuKeys(programs);
    let state = createSession(programs);
    keys.forEach((key, index) => {
      state = sessionKey(state, key, timeline[index] ?? 0).state;
    });
    const counters = sessionCounters(state);
    expect(counters.effective).toBe(cpuEffectiveKeystrokes(timeline));
    expect(counters.miss).toBe(0);
    expect(counters.ignored).toBe(0);
  });

  it('runs out of blocks before time at the top level, and the score is what was typed', () => {
    const timeline = cpuTimeline(programs, CPU_MAX_LEVEL, 3n);
    expect(cpuEffectiveKeystrokes(timeline)).toBeLessThanOrEqual(timeline.length);
    expect(cpuScore(timeline)).toBe(Math.round(cpuEffectiveKeystrokes(timeline) / 2));
  });

  it('counts a key by its rounded time like a player, so the last millisecond is excluded', () => {
    expect(cpuEffectiveKeystrokes(Float64Array.of(PLAY_DURATION_MS - 0.6))).toBe(1);
    expect(cpuEffectiveKeystrokes(Float64Array.of(PLAY_DURATION_MS - 0.4))).toBe(0);
    expect(cpuEffectiveKeystrokes(Float64Array.of(PLAY_DURATION_MS))).toBe(0);
  });

  it('wins about half of same-level matches against an equally fast steady player', () => {
    // §4.3.3 targets a 40–60% same-band win rate. The "player" scores exactly the base KPM.
    const level = 48;
    let wins = 0;
    const runs = 400;
    for (let seed = 1; seed <= runs; seed += 1) {
      const long = syntheticPrograms(BigInt(seed));
      const opponent = cpuScore(cpuTimeline(long, level, BigInt(seed)));
      if (judgeMatch(Math.round(cpuBaseKpm(level)), opponent) === 'win') wins += 1;
    }
    expect(wins / runs).toBeGreaterThan(0.4);
    expect(wins / runs).toBeLessThan(0.6);
  });
});

describe('judgeMatch', () => {
  it('counts a tie as a win and one point short as a loss', () => {
    expect(judgeMatch(100, 100)).toBe('win');
    expect(judgeMatch(101, 100)).toBe('win');
    expect(judgeMatch(99, 100)).toBe('lose');
    expect(judgeMatch(0, 0)).toBe('win');
  });
});
