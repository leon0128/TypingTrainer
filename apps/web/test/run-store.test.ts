import type { StartSessionResponse } from '@typing-trainer/contracts';
import {
  ENTER_KEY,
  IDLE_LIMIT_MS,
  PLAY_DURATION_MS,
  computeMetrics,
  replaySession,
  sessionCounters,
} from '@typing-trainer/typing-engine';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createRunStore, issuedRunProblem, type RunStore } from '../src/features/play/run-store';
import { IF_PROGRAM, PADDED_PROGRAM } from './program-fixture';

/** `if (a) { b }` then `a:  1`: two blocks, both short enough to finish inside a run. */
const BLOCKS = [IF_PROGRAM, PADDED_PROGRAM];

/** The keys that type IF_PROGRAM correctly, in order. */
const IF_KEYS = ['i', 'f', '(', 'a', '{', ENTER_KEY, 'b', ENTER_KEY];
/** The keys that type PADDED_PROGRAM correctly; the padding before the space is not typed. */
const PADDED_KEYS = ['a', ':', ' ', '1'];

function issuedRun(overrides: Partial<StartSessionResponse> = {}): StartSessionResponse {
  return {
    sessionId: '11111111-1111-4111-8111-111111111111',
    language: 'python',
    mode: 'single',
    seed: '42',
    contentRevision: 'a'.repeat(64),
    blocks: BLOCKS,
    durationMs: PLAY_DURATION_MS,
    idleLimitMs: IDLE_LIMIT_MS,
    ...overrides,
  };
}

/** Types keys into a store at a steady pace, starting `startMs` after the run was issued. */
function play(store: RunStore, keys: readonly string[], startMs: number, stepMs: number): number {
  let now = startMs;
  for (const key of keys) {
    store.press(key, now);
    now += stepMs;
  }
  return now - stepMs;
}

describe('issuedRunProblem', () => {
  it('accepts a run that matches the engine', () => {
    expect(issuedRunProblem(issuedRun())).toBeNull();
  });

  it.each([
    ['run length', { durationMs: PLAY_DURATION_MS + 1000 }],
    ['idle limit', { idleLimitMs: IDLE_LIMIT_MS + 1000 }],
  ])('refuses a run whose %s differs from the engine', (_, overrides) => {
    expect(issuedRunProblem(issuedRun(overrides))).toMatch(/reload/);
    expect(() => createRunStore(issuedRun(overrides), 0)).toThrow(RangeError);
  });

  it('refuses a run with no blocks', () => {
    expect(issuedRunProblem(issuedRun({ blocks: [] }))).toMatch(/no blocks/);
  });
});

describe('run store', () => {
  it('starts the countdown on the first keystroke, however long the player waited', () => {
    const store = createRunStore(issuedRun(), 0);
    expect(store.getSnapshot().phase).toBe('ready');
    expect(store.remainingMs(30_000)).toBe(PLAY_DURATION_MS);

    store.press('i', 30_000);
    expect(store.getSnapshot().phase).toBe('playing');
    expect(store.elapsedMs(30_000)).toBe(0);
    expect(store.remainingMs(31_000)).toBe(PLAY_DURATION_MS - 1000);
    // The submitted log always starts at zero, which the server checks (§9.8).
    expect(store.buildLog().deltas[0]).toBe(0);
  });

  it('moves to the next block and ends the run when the last one is done', () => {
    const store = createRunStore(issuedRun(), 0);
    const afterFirst = play(store, IF_KEYS, 1000, 100);
    expect(store.getSnapshot().session.blockIndex).toBe(1);
    expect(store.getSnapshot().phase).toBe('playing');

    play(store, PADDED_KEYS, afterFirst + 100, 100);
    expect(store.getSnapshot()).toMatchObject({ phase: 'ended', endedBy: 'blocks' });
  });

  it('ends the run when the countdown runs out, with no key needed', () => {
    const store = createRunStore(issuedRun(), 0);
    store.press('i', 1000);
    store.tick(1000 + PLAY_DURATION_MS - 1);
    expect(store.getSnapshot().phase).toBe('playing');

    store.tick(1000 + PLAY_DURATION_MS);
    expect(store.getSnapshot()).toMatchObject({ phase: 'ended', endedBy: 'time' });
    expect(store.remainingMs(1000 + PLAY_DURATION_MS)).toBe(0);
  });

  it('never logs a key that arrived after the run ended', () => {
    const store = createRunStore(issuedRun(), 0);
    store.press('i', 0);
    store.press('f', PLAY_DURATION_MS);
    expect(store.getSnapshot()).toMatchObject({ phase: 'ended', endedBy: 'time' });
    expect(store.buildLog()).toEqual({ version: 1, keys: 'i', deltas: [0] });

    store.press('(', PLAY_DURATION_MS + 10);
    expect(store.buildLog().keys).toBe('i');
  });

  it('stops the stopwatch where the run ended, whichever way it ended', () => {
    const finished = createRunStore(issuedRun(), 0);
    const lastKeyMs = play(finished, [...IF_KEYS, ...PADDED_KEYS], 500, 100) - 500;
    expect(finished.getSnapshot().endedBy).toBe('blocks');
    expect(finished.elapsedMs(900_000)).toBe(lastKeyMs);

    const expired = createRunStore(issuedRun(), 0);
    expired.press('i', 0);
    expired.press('f', PLAY_DURATION_MS + 5_000);
    expect(expired.elapsedMs(900_000)).toBe(PLAY_DURATION_MS);
  });

  it('leaves paused time out of the run time and out of the log', () => {
    const store = createRunStore(issuedRun(), 0);
    store.press('i', 0);
    store.pause(100);
    expect(store.elapsedMs(5_000)).toBe(100);
    store.resume(5_100);
    expect(store.getSnapshot().phase).toBe('playing');
    store.press('f', 5_200);

    expect(store.elapsedMs(5_200)).toBe(200);
    expect(store.buildLog().deltas).toEqual([0, 200]);
  });

  it('resumes on a keystroke, without counting the pause as run time', () => {
    const store = createRunStore(issuedRun(), 0);
    store.press('i', 0);
    store.pause(100);
    // A key can arrive before the focus handler resumes, and must resume the run itself.
    store.press('f', 10_100);

    expect(store.getSnapshot().phase).toBe('playing');
    expect(store.buildLog().deltas).toEqual([0, 100]);
    expect(store.elapsedMs(10_100)).toBe(100);
  });

  it('ignores a clock reading that moved backwards', () => {
    const store = createRunStore(issuedRun(), 0);
    store.press('i', 1000);
    // The engine refuses run time that goes backwards; the store must not hand it any.
    expect(() => {
      store.press('f', 900);
    }).not.toThrow();
    expect(store.buildLog().deltas).toEqual([0, 0]);
  });

  it('discards a run left idle past the limit, keeping the run time that was typed', () => {
    const store = createRunStore(issuedRun(), 0);
    store.press('i', 1000);
    store.pause(1100);

    // Idle is the wall clock since the run was issued minus the 100 ms typed, so the limit falls
    // 100 ms after it: the second before the first key counts as idle too.
    store.tick(IDLE_LIMIT_MS + 100);
    expect(store.getSnapshot().phase).toBe('paused');

    store.tick(IDLE_LIMIT_MS + 101);
    expect(store.getSnapshot()).toMatchObject({ phase: 'ended', endedBy: 'idle' });
    expect(store.elapsedMs(2_000_000)).toBe(100);
  });

  it('counts the wait before the first key as idle time, as the server does', () => {
    const store = createRunStore(issuedRun(), 0);
    store.tick(IDLE_LIMIT_MS);
    expect(store.getSnapshot().phase).toBe('ready');

    store.tick(IDLE_LIMIT_MS + 1);
    expect(store.getSnapshot()).toMatchObject({ phase: 'ended', endedBy: 'idle' });
  });

  it('flags a miss for the caret and leaves the engine position to flash', () => {
    const store = createRunStore(issuedRun(), 0);
    store.press('i', 0);
    store.press('x', 100);

    const { missSeq, lastMiss, session } = store.getSnapshot();
    expect(missSeq).toBe(1);
    expect(lastMiss).toEqual({
      atomIndex: session.block?.atomIndex,
      charIndex: session.block?.charIndex,
    });
    // A miss is logged: the server counts it too.
    expect(store.buildLog().keys).toBe('ix');
  });

  it('reports the official metrics while the run is going, since the run length is fixed', () => {
    const store = createRunStore(issuedRun(), 0);
    play(store, IF_KEYS, 0, 100);
    expect(store.liveMetrics()).toEqual(
      computeMetrics(sessionCounters(store.getSnapshot().session)),
    );
  });
});

describe('the log the server replays', () => {
  it('reproduces the counters of the live run', () => {
    const store = createRunStore(issuedRun(), 0);
    const afterFirst = play(store, [...IF_KEYS.slice(0, 3), 'x', ...IF_KEYS.slice(3)], 2_000, 120);
    play(store, PADDED_KEYS.slice(0, 2), afterFirst + 120, 120);

    const replay = replaySession(BLOCKS, store.buildLog());
    expect(replay.counters).toEqual(sessionCounters(store.getSnapshot().session));
    expect(replay.metrics).toEqual(store.liveMetrics());
    expect(replay.expiredKeys).toBe(0);
  });

  it('reproduces the counters for any sequence of keys and pauses', () => {
    const keys = fc.constantFrom('i', 'f', '(', 'a', '{', 'b', ':', '1', ' ', 'x', ENTER_KEY);
    fc.assert(
      fc.property(
        fc.array(fc.tuple(keys, fc.integer({ min: 0, max: 400 })), { maxLength: 60 }),
        fc.integer({ min: 0, max: 20_000 }),
        (script, startMs) => {
          const store = createRunStore(issuedRun(), 0);
          let now = startMs;
          for (const [key, gap] of script) {
            now += gap;
            store.press(key, now);
          }

          const log = store.buildLog();
          const replay = replaySession(BLOCKS, log);
          expect(replay.counters).toEqual(sessionCounters(store.getSnapshot().session));
          expect(replay.expiredKeys).toBe(0);
          expect(log.deltas[0] ?? 0).toBe(0);
        },
      ),
    );
  });
});
