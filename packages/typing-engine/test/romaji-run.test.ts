import { countMaxKeystrokes } from '@typing-trainer/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildSessionLog,
  canonicalReached,
  cpuKeys,
  createSession,
  ghostTimeline,
  maxReached,
  replaySession,
  sessionKey,
} from '../src';
import { NL, RM, program } from './helpers';

const SHI = RM('し', 'shi', 'si');
const KA = RM('か', 'ka');
const N = RM('ん', 'n', 'nn', "n'", 'xn');
/** し か ん か, one line, then か: a block with a choice in two of its units. */
const FIRST = program([SHI, KA, N, KA]);
const SECOND = program([KA, NL, SHI]);

const logOf = (script: string) =>
  buildSessionLog(Array.from(script).map((key, index) => ({ key, activeMs: index * 100 })));

describe('the ceiling of a Japanese run (§13.5)', () => {
  it('is the longest way to type the blocks reached, and the shortest way is not a ceiling', () => {
    const session = createSession([FIRST, SECOND]);
    expect(canonicalReached(session)).toBe(FIRST.canonicalKeystrokes);
    expect(maxReached(session)).toBe(countMaxKeystrokes(FIRST.atoms));
    expect(FIRST.canonicalKeystrokes).toBe(2 + 2 + 1 + 2);
    expect(countMaxKeystrokes(FIRST.atoms)).toBe(3 + 2 + 2 + 2);
  });

  it('counts a block once it is reached, not before', () => {
    let session = createSession([FIRST, SECOND]);
    for (const [index, key] of Array.from('sikankaa').entries()) {
      session = sessionKey(session, key, index * 100).state;
    }
    expect(session.blockIndex).toBe(1);
    expect(maxReached(session)).toBe(
      countMaxKeystrokes(FIRST.atoms) + countMaxKeystrokes(SECOND.atoms),
    );
  });

  it('leaves code and English unchanged: there the longest way is the only way', () => {
    const plain = program([RM('か', 'ka'), NL, RM('い', 'i')]);
    expect(maxReached(createSession([plain]))).toBe(canonicalReached(createSession([plain])));
  });

  it('is what a replay of the longest spelling reaches, and only that', () => {
    const replay = replaySession([FIRST], logOf('shikannka'));
    expect(replay.counters).toMatchObject({ effective: 9, miss: 0 });
    expect(replay.counters.effective).toBeGreaterThan(replay.canonicalReached);
    expect(replay.counters.effective).toBeLessThanOrEqual(replay.maxReached);
    expect(replay.maxReached).toBe(countMaxKeystrokes(FIRST.atoms));
  });

  it('never lets a replay reach past it, whatever is typed', () => {
    for (const script of ['shikannka', 'sikanka', 'shikan', 'shikankaaa', 'zzz']) {
      const replay = replaySession([FIRST], logOf(script));
      expect(replay.counters.effective).toBeLessThanOrEqual(replay.maxReached);
    }
  });
});

describe('the CPU and the Ghost on Japanese blocks', () => {
  it('type the shortest spelling of every unit, and the line break as Enter', () => {
    expect(cpuKeys([FIRST])).toEqual(['s', 'i', 'k', 'a', 'n', 'k', 'a']);
    expect(cpuKeys([SECOND])).toEqual(['k', 'a', 'Enter', 's', 'i']);
  });

  it('are paced by the same keys, so the Ghost has one interval per key of the shortest route', () => {
    expect(ghostTimeline([FIRST, SECOND], 200)).toHaveLength(
      FIRST.canonicalKeystrokes + SECOND.canonicalKeystrokes,
    );
  });

  it('play through the engine like a player, and finish the blocks', () => {
    let session = createSession([FIRST, SECOND]);
    const keys = cpuKeys([FIRST, SECOND]);
    for (const [index, key] of keys.entries()) {
      const result = sessionKey(session, key, index * 100);
      expect(result.verdict).toBe('CORRECT');
      session = result.state;
    }
    expect(session.endedBy).toBe('blocks');
  });
});
