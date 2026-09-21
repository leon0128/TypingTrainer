import type { Atom, SessionLog, TypingProgram } from '@typing-trainer/contracts';
import { IDLE_LIMIT_MS, replaySession, type SessionReplay } from '@typing-trainer/typing-engine';
import { describe, expect, it } from 'vitest';

import { checkPlausibility } from '../src/modules/play/play-validation';
import { PLAUSIBILITY_LIMITS } from '../src/modules/play/plausibility-limits';

const LIMITS = PLAUSIBILITY_LIMITS;

/** One long block, so a run never finishes it and the speed windows can be filled. */
const BLOCK_KEYS = 600;
const program: TypingProgram = {
  blockId: 'go/probe',
  canonicalKeystrokes: BLOCK_KEYS,
  atoms: [{ kind: 'literal', text: 'x'.repeat(BLOCK_KEYS) }],
};

/** A correct log of `count` keys, evenly spaced. */
function log(count: number, stepMs: number): SessionLog {
  return {
    version: 1,
    keys: 'x'.repeat(count),
    deltas: Array.from({ length: count }, (_, index) => (index === 0 ? 0 : stepMs)),
  };
}

function replayOf(count: number, stepMs: number): { log: SessionLog; replay: SessionReplay } {
  const submitted = log(count, stepMs);
  return { log: submitted, replay: replaySession([program], submitted) };
}

/** A plain run: 60 keys at 100 ms, submitted right away. */
const plain = () => replayOf(60, 100);

describe('checkPlausibility', () => {
  it('accepts a run typed at a human pace', () => {
    const { log: submitted, replay } = plain();
    expect(replay.metrics.effective).toBe(60);
    expect(checkPlausibility(submitted, replay, 10_000)).toBeUndefined();
  });

  it('refuses a log whose first key is not at zero', () => {
    const { log: submitted, replay } = plain();
    const shifted = { ...submitted, deltas: [1, ...submitted.deltas.slice(1)] };
    expect(checkPlausibility(shifted, replay, 10_000)?.reason).toBe('log-start');
  });

  it('refuses keys logged after the run ended', () => {
    // The last key lands beyond the 120-second run, so the engine ignores it.
    const { log: submitted, replay } = replayOf(3, 60_000);
    expect(replay.expiredKeys).toBeGreaterThan(LIMITS.maxKeysAfterEnd);
    expect(checkPlausibility(submitted, replay, 10_000_000)?.reason).toBe('keys-after-end');
  });

  it('refuses more run time than has passed since the run was issued', () => {
    const { log: submitted, replay } = replayOf(3, 20_000);
    const wall = replay.lastKeyMs - LIMITS.wallClockToleranceMs - 1;
    expect(checkPlausibility(submitted, replay, wall)?.reason).toBe('run-time');
    expect(
      checkPlausibility(submitted, replay, replay.lastKeyMs + LIMITS.wallClockToleranceMs),
    ).toBeUndefined();
  });

  it('refuses a run left idle beyond the limit and its grace', () => {
    const { log: submitted, replay } = plain();
    const idle = (extraMs: number) => replay.lastKeyMs + IDLE_LIMIT_MS + extraMs;
    expect(checkPlausibility(submitted, replay, idle(LIMITS.idleGraceMs))).toBeUndefined();
    expect(checkPlausibility(submitted, replay, idle(LIMITS.idleGraceMs + 1))?.reason).toBe('idle');
  });

  it('refuses a burst faster than any human, and accepts the limit itself', () => {
    // maxPeakKpm10s keys per minute means this many keys in a 10-second window.
    const perWindow = LIMITS.maxPeakKpm10s / 6;
    const atLimit = replayOf(perWindow, 10_000 / perWindow);
    expect(atLimit.replay.intervals.peakKpm10s).toBe(LIMITS.maxPeakKpm10s);
    expect(checkPlausibility(atLimit.log, atLimit.replay, 60_000)).toBeUndefined();

    // One key more than the window allows, typed faster still.
    const tooFast = replayOf(perWindow + 1, Math.floor(10_000 / perWindow) - 5);
    expect(tooFast.replay.intervals.peakKpm10s).toBeGreaterThan(LIMITS.maxPeakKpm10s);
    expect(checkPlausibility(tooFast.log, tooFast.replay, 60_000)?.reason).toBe('speed');
  });

  it('refuses a whole-run speed above the limit', () => {
    const { log: submitted, replay } = plain();
    const fast = { ...replay, metrics: { ...replay.metrics, kpm: LIMITS.maxRunKpm + 1 } };
    expect(checkPlausibility(submitted, fast, 10_000)?.reason).toBe('speed');
    const atLimit = { ...replay, metrics: { ...replay.metrics, kpm: LIMITS.maxRunKpm } };
    expect(checkPlausibility(submitted, atLimit, 10_000)).toBeUndefined();
  });

  describe('a Japanese block, where a longer spelling is more keys (§13.5)', () => {
    // 100 units of し: `si` is two keys and `shi` three, so a run may spell either.
    const SHI: Atom = { kind: 'romaji', display: 'し', alternatives: ['shi', 'si'] };
    const japanese: TypingProgram = {
      blockId: 'ja-word/probe',
      canonicalKeystrokes: 200,
      atoms: Array.from({ length: 100 }, () => SHI),
    };
    const replayJapanese = (spelling: string, count: number) => {
      const keys = spelling.repeat(count);
      const submitted: SessionLog = {
        version: 1,
        keys,
        deltas: Array.from({ length: keys.length }, (_, index) => (index === 0 ? 0 : 100)),
      };
      return { log: submitted, replay: replaySession([japanese], submitted) };
    };

    it('accepts a run spelled with the longest spelling, which passes the shortest total', () => {
      const { log: submitted, replay } = replayJapanese('shi', 100);
      expect(replay.counters.effective).toBe(300);
      expect(replay.counters.effective).toBeGreaterThan(replay.canonicalReached);
      expect(replay.maxReached).toBe(300);
      expect(checkPlausibility(submitted, replay, 60_000)).toBeUndefined();
    });

    it('still refuses more effective keys than the longest spelling of the blocks reached', () => {
      const { log: submitted, replay } = replayJapanese('shi', 100);
      const inflated = {
        ...replay,
        counters: { ...replay.counters, effective: replay.maxReached + 1 },
      };
      expect(checkPlausibility(submitted, inflated, 60_000)?.reason).toBe('progress');
      const atCeiling = {
        ...replay,
        counters: { ...replay.counters, effective: replay.maxReached },
      };
      expect(checkPlausibility(submitted, atCeiling, 60_000)).toBeUndefined();
    });
  });

  it('refuses more effective keys than the blocks reached can hold', () => {
    const { log: submitted, replay } = plain();
    const inflated = {
      ...replay,
      counters: { ...replay.counters, effective: replay.maxReached + 1 },
    };
    expect(checkPlausibility(submitted, inflated, 10_000)?.reason).toBe('progress');
  });

  it('reports the first failing check, so one rejection cannot hide another', () => {
    const { log: submitted, replay } = replayOf(3, 60_000);
    const shifted = { ...submitted, deltas: [7, ...submitted.deltas.slice(1)] };
    // Both the first delta and the keys after the end are wrong; the log start is reported.
    expect(checkPlausibility(shifted, replay, 10_000)?.reason).toBe('log-start');
  });
});
