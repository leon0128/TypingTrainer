import type { TypingProgram } from '@typing-trainer/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  IDLE_LIMIT_MS,
  PLAY_DURATION_MS,
  buildSessionLog,
  canonicalReached,
  createSession,
  endSessionByTime,
  isSessionIdleExpired,
  replaySession,
  sessionCounters,
  sessionKey,
  type LoggedKey,
  type SessionState,
} from '../src';
import { PROBE_KEYS, correctKeys, programArbitrary, spacingArbitrary } from './arbitraries';
import { L, NL, program } from './helpers';

const AB = program([L('ab')]);
const C = program([L('c')]);
const TWO_LINES = program([L('x'), NL, L('y')]);

function typeAll(state: SessionState, keys: readonly string[], startMs = 0, stepMs = 100) {
  let current = state;
  const verdicts: string[] = [];
  keys.forEach((key, index) => {
    const result = sessionKey(current, key, startMs + index * stepMs);
    current = result.state;
    verdicts.push(result.verdict);
  });
  return { state: current, verdicts };
}

describe('play session queue', () => {
  it('moves to the next block as soon as one is complete and ends after the last', () => {
    const { state, verdicts } = typeAll(createSession([AB, C]), ['a', 'b', 'c', 'd']);
    expect(verdicts).toEqual(['CORRECT', 'CORRECT', 'CORRECT', 'EXPIRED']);
    expect(state).toMatchObject({ blockIndex: 2, block: null, endedBy: 'blocks' });
    expect(sessionCounters(state)).toEqual({ raw: 3, effective: 3, miss: 0, ignored: 0 });
  });

  it('counts the partial progress of the current block (Q5)', () => {
    const { state } = typeAll(createSession([AB, TWO_LINES]), ['a', 'b', 'x', 'z']);
    expect(state.blockIndex).toBe(1);
    expect(sessionCounters(state)).toEqual({ raw: 4, effective: 3, miss: 1, ignored: 0 });
    expect(canonicalReached(state)).toBe(AB.canonicalKeystrokes + TWO_LINES.canonicalKeystrokes);
  });

  it('applies a key just before 120 seconds and ends the run with one at 120 seconds', () => {
    let state = createSession([AB]);
    state = sessionKey(state, 'a', PLAY_DURATION_MS - 1).state;
    const late = sessionKey(state, 'b', PLAY_DURATION_MS);
    expect(late.verdict).toBe('EXPIRED');
    expect(late.state).toMatchObject({ endedBy: 'time', activeMs: PLAY_DURATION_MS });
    expect(sessionCounters(late.state).effective).toBe(1);
  });

  it('rounds run time to whole milliseconds before comparing with the duration', () => {
    // 119 999.6 rounds to 120 000 and ends the run; 119 999.4 rounds to 119 999 and is applied.
    expect(sessionKey(createSession([AB]), 'a', PLAY_DURATION_MS - 0.4).verdict).toBe('EXPIRED');
    expect(sessionKey(createSession([AB]), 'a', PLAY_DURATION_MS - 0.6).verdict).toBe('CORRECT');
  });

  it('ends by time without a key when the countdown reaches zero', () => {
    const state = endSessionByTime(sessionKey(createSession([AB]), 'a', 10).state);
    expect(state).toMatchObject({ endedBy: 'time', activeMs: PLAY_DURATION_MS });
    expect(sessionKey(state, 'b', PLAY_DURATION_MS).verdict).toBe('EXPIRED');
  });

  it('rejects run time going backwards and an empty block list', () => {
    const state = sessionKey(createSession([AB]), 'a', 500).state;
    expect(() => sessionKey(state, 'b', 400)).toThrow(RangeError);
    expect(() => createSession([])).toThrow(RangeError);
  });
});

describe('idle limit (§4.1)', () => {
  it('expires only when wall time minus run time exceeds 15 minutes', () => {
    expect(IDLE_LIMIT_MS).toBe(15 * 60 * 1000);
    expect(isSessionIdleExpired(IDLE_LIMIT_MS + 50_000, 50_000)).toBe(false);
    expect(isSessionIdleExpired(IDLE_LIMIT_MS + 50_001, 50_000)).toBe(true);
    // The wait before the first key counts as idle time.
    expect(isSessionIdleExpired(IDLE_LIMIT_MS + 1, 0)).toBe(true);
  });
});

describe('session log', () => {
  it('encodes Enter and Tab as single characters with rounded deltas', () => {
    const log = buildSessionLog([
      { key: 'x', activeMs: 0 },
      { key: 'Enter', activeMs: 120.4 },
      { key: 'Tab', activeMs: 240.6 },
    ]);
    expect(log).toEqual({ version: 1, keys: 'x\n\t', deltas: [0, 120, 121] });
    expect(replaySession([TWO_LINES], log).counters).toEqual({
      raw: 3,
      effective: 2,
      miss: 1,
      ignored: 0,
    });
  });

  it('reports how the run ended, ignored keys, the ceiling, and interval statistics', () => {
    const log = buildSessionLog([
      { key: 'a', activeMs: 0 },
      { key: 'b', activeMs: 50 },
      { key: 'c', activeMs: 200 },
      { key: 'd', activeMs: 350 },
    ]);
    const replay = replaySession([AB, C], log);
    expect(replay).toMatchObject({
      endedBy: 'blocks',
      blocksReached: 2,
      canonicalReached: 3,
      lastKeyMs: 200,
      expiredKeys: 1,
      intervals: { minMs: 50, medianMs: 50, peakKpm10s: 18 },
      metrics: { effective: 3, kpm: 1.5, score: 2 },
    });
  });

  it('reports log-end when the log stops before the run is over', () => {
    const replay = replaySession([AB], buildSessionLog([{ key: 'a', activeMs: 0 }]));
    expect(replay).toMatchObject({ endedBy: 'log-end', lastKeyMs: 0, intervals: { minMs: null } });
  });

  it('rejects a log whose keys and deltas disagree', () => {
    expect(() => replaySession([AB], { version: 1, keys: 'ab', deltas: [0] })).toThrow(RangeError);
  });
});

describe('live session and log replay (property)', () => {
  const programsArbitrary = fc.array(programArbitrary, { minLength: 1, maxLength: 3 });

  const keyStream = fc
    .tuple(
      programsArbitrary,
      spacingArbitrary,
      fc.array(fc.tuple(fc.nat(), fc.constantFrom(...PROBE_KEYS)), { maxLength: 30 }),
    )
    .map(([programs, spacing, noise]) => {
      const keys = programs.flatMap((p: TypingProgram) => correctKeys(p, spacing));
      for (const [at, key] of noise) keys.splice(at % (keys.length + 1), 0, key);
      return { programs, keys };
    });

  it('recomputes exactly what the live session counted, and never exceeds the ceiling', () => {
    fc.assert(
      fc.property(
        keyStream,
        // Fractional gaps up to 400 ms.
        fc.array(fc.double({ min: 0, max: 400, noNaN: true }), { minLength: 1, maxLength: 50 }),
        // The first key lands between 90 and 121 seconds (fractional) so that runs regularly
        // cross the 120-second end, where rounding decides whether a key still counts. The first
        // delta then carries that offset, which the log format allows.
        fc.double({ min: 90_000, max: 121_000, noNaN: true }),
        ({ programs, keys }, gaps, startMs) => {
          let live = createSession(programs);
          let time = startMs;
          const logged: LoggedKey[] = [];
          keys.forEach((key, index) => {
            time += gaps[index % gaps.length] ?? 0;
            live = sessionKey(live, key, time).state;
            logged.push({ key, activeMs: time });
          });

          const replay = replaySession(programs, buildSessionLog(logged));
          expect(replay.counters).toEqual(sessionCounters(live));
          expect(replay.state.blockIndex).toBe(live.blockIndex);
          expect(replay.state.endedBy).toBe(live.endedBy);
          expect(replay.counters.effective).toBeLessThanOrEqual(replay.canonicalReached);
          if (replay.state.endedBy === 'blocks') {
            expect(replay.counters.effective).toBe(replay.canonicalReached);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('agrees with the live session for fractional key times around the 120-second end', () => {
    fc.assert(
      fc.property(
        keyStream,
        // Keys start within a few milliseconds of the end, at fractions that round down, to the
        // nearest half, or up, and continue in sub-millisecond steps. Without millisecond rounding
        // in sessionKey, a key at 119 999.6 ms would count live but expire in the replayed log.
        fc.integer({ min: 119_995, max: 120_000 }),
        fc.constantFrom(0, 0.4, 0.5, 0.6),
        fc.array(fc.constantFrom(0, 0.3, 0.5, 0.7, 1), { minLength: 1, maxLength: 12 }),
        ({ programs, keys }, startWholeMs, startFraction, gaps) => {
          let live = createSession(programs);
          let time = startWholeMs + startFraction;
          const logged: LoggedKey[] = [];
          keys.forEach((key, index) => {
            live = sessionKey(live, key, time).state;
            logged.push({ key, activeMs: time });
            time += gaps[index % gaps.length] ?? 0;
          });

          const replay = replaySession(programs, buildSessionLog(logged));
          expect(replay.counters).toEqual(sessionCounters(live));
          expect(replay.state.endedBy).toBe(live.endedBy);
        },
      ),
      { numRuns: 500 },
    );
  });
});
