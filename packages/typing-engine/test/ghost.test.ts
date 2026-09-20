import type { Atom, TypingProgram } from '@typing-trainer/contracts';
import { describe, expect, it } from 'vitest';

import {
  PLAY_DURATION_MS,
  cpuEffectiveKeystrokes,
  cpuKeys,
  cpuScore,
  createSeededRandom,
  createSession,
  ghostTimeline,
  judgeMatch,
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

/** `count` blocks of about 48 tokens each, mixing every key class. */
function blocks(count: number, seed: bigint): TypingProgram[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => {
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

/** Enough keys for a score of 2,400 (the fastest the server accepts) with room to spare. */
const PLENTY = blocks(40, 3n);

describe('ghostTimeline', () => {
  it('scores exactly the record, for every record from 1 to 2,400', () => {
    // §4.4: "beat the Ghost" and "beat your record" mean the same thing. A half rounds up, so this
    // is the boundary that a wrong interval or an off-by-one key would break.
    for (let record = 1; record <= 2400; record += 1) {
      const score = cpuScore(ghostTimeline(PLENTY, record));
      if (score !== record)
        throw new Error(`record ${String(record)} gave a Ghost score ${String(score)}`);
    }
  });

  it('types one key every 60000 / record milliseconds, with no variation', () => {
    const timeline = ghostTimeline(PLENTY, 150);
    for (let index = 0; index < 50; index += 1) {
      expect(timeline[index]).toBeCloseTo((index + 1) * 400, 6);
    }
    const gaps = Array.from(timeline.slice(1, 200), (time, index) => time - (timeline[index] ?? 0));
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1e-6);
  });

  it('types exactly the keys the CPU would: the same canonical keys of the same blocks', () => {
    expect(ghostTimeline(PLENTY, 100)).toHaveLength(cpuKeys(PLENTY).length);
  });

  it('agrees with the real session engine, key by key, with no misses', () => {
    const programs = blocks(20, 9n);
    const timeline = ghostTimeline(programs, 300);
    let state = createSession(programs);
    cpuKeys(programs).forEach((key, index) => {
      state = sessionKey(state, key, timeline[index] ?? 0).state;
    });
    const counters = sessionCounters(state);
    expect(counters.effective).toBe(cpuEffectiveKeystrokes(timeline));
    expect(counters.miss).toBe(0);
  });

  it('stops when the blocks run out, scoring what it typed rather than the record', () => {
    const short = blocks(1, 5n);
    const typed = cpuKeys(short).length;
    const timeline = ghostTimeline(short, 900);
    expect(cpuEffectiveKeystrokes(timeline)).toBe(typed);
    expect(cpuScore(timeline)).toBe(Math.round(typed / 2));
    expect(cpuScore(timeline)).toBeLessThan(900);
  });

  it('lets a player who scores the record win, and one point less lose', () => {
    const record = 173;
    const ghost = cpuScore(ghostTimeline(PLENTY, record));
    expect(judgeMatch(record, ghost)).toBe('win');
    expect(judgeMatch(record - 1, ghost)).toBe('lose');
  });

  it('refuses a record that cannot set a pace', () => {
    for (const record of [0, -1, 1.5, Number.NaN]) {
      expect(() => ghostTimeline(PLENTY, record)).toThrow(RangeError);
    }
  });

  it('never types at or after the end of the run', () => {
    const timeline = ghostTimeline(PLENTY, 500);
    const typed = cpuEffectiveKeystrokes(timeline);
    expect(Math.round(timeline[typed - 1] ?? 0)).toBeLessThan(PLAY_DURATION_MS);
    expect(Math.round(timeline[typed] ?? 0)).toBeGreaterThanOrEqual(PLAY_DURATION_MS);
  });
});
