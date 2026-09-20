import type { StartSessionResponse } from '@typing-trainer/contracts';
import {
  IDLE_LIMIT_MS,
  PLAY_DURATION_MS,
  cpuScore,
  cpuTimeline,
  sessionCounters,
} from '@typing-trainer/typing-engine';
import { describe, expect, it } from 'vitest';

import { createCpuOpponent } from '../src/features/play/cpu-opponent';
import { createRunStore } from '../src/features/play/run-store';
import { IF_PROGRAM, PADDED_PROGRAM } from './program-fixture';

const BLOCKS = [IF_PROGRAM, PADDED_PROGRAM];

const CPU_RUN: StartSessionResponse = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  language: 'python',
  mode: 'cpu',
  cpuLevel: 60,
  seed: '42',
  contentRevision: 'a'.repeat(64),
  blocks: BLOCKS,
  durationMs: PLAY_DURATION_MS,
  idleLimitMs: IDLE_LIMIT_MS,
};

const timeline = cpuTimeline(BLOCKS, 60, 42n);
const effectiveOf = (opponent: ReturnType<typeof createCpuOpponent>) =>
  sessionCounters(opponent.getSnapshot()).effective;

describe('createCpuOpponent', () => {
  it('has typed nothing until the first key is due', () => {
    const opponent = createCpuOpponent(CPU_RUN, 60);
    opponent.advanceTo(0);
    expect(effectiveOf(opponent)).toBe(0);
    opponent.advanceTo((timeline[0] ?? 0) - 1);
    expect(effectiveOf(opponent)).toBe(0);
  });

  it('types exactly the keys whose time has come, and never misses', () => {
    const opponent = createCpuOpponent(CPU_RUN, 60);
    for (const [index, time] of Array.from(timeline).entries()) {
      opponent.advanceTo(time);
      // Auto-inserted text also counts as effective keystrokes, so compare with the engine's own
      // count for the same prefix rather than with the index.
      expect(sessionCounters(opponent.getSnapshot()).miss).toBe(0);
      expect(sessionCounters(opponent.getSnapshot()).raw).toBe(index + 1);
    }
    expect(opponent.getSnapshot().endedBy).toBe('blocks');
  });

  it('scores at the end of the run exactly what the server will judge it at', () => {
    // Twenty blocks at level 1 (50 KPM) outlast the 120 seconds, so the run ends on time.
    const long = { ...CPU_RUN, cpuLevel: 1, blocks: Array.from({ length: 20 }, () => IF_PROGRAM) };
    const opponent = createCpuOpponent(long, 1);
    opponent.advanceTo(PLAY_DURATION_MS);
    expect(opponent.getSnapshot().endedBy).toBe('time');
    expect(opponent.liveMetrics().accuracy).toBe(1);
    expect(opponent.liveMetrics().score).toBe(cpuScore(cpuTimeline(long.blocks, 1, 42n)));
  });

  it('notifies once per advance, not once per key, and not when nothing changed', () => {
    const opponent = createCpuOpponent(CPU_RUN, 60);
    let notified = 0;
    opponent.subscribe(() => {
      notified += 1;
    });
    opponent.advanceTo(0);
    expect(notified).toBe(0);
    opponent.advanceTo(timeline[4] ?? 0);
    expect(notified).toBe(1);
    opponent.advanceTo(timeline[4] ?? 0);
    expect(notified).toBe(1);
  });
});

describe('the run store with an opponent', () => {
  it('has no opponent in single play', () => {
    expect(createRunStore({ ...CPU_RUN, mode: 'single', cpuLevel: null }, 0).opponent).toBeNull();
  });

  it('starts the CPU with the first keystroke, and holds it while the player is paused', () => {
    const store = createRunStore(CPU_RUN, 0);
    const opponent = store.opponent;
    if (opponent === null) throw new Error('expected an opponent');
    const typed = () => sessionCounters(opponent.getSnapshot()).raw;

    // Nothing moves before the player's first key, however long the wait.
    store.tick(5000);
    expect(typed()).toBe(0);

    store.press('i', 5000);
    const halfway = timeline[6] ?? 0;
    store.tick(5000 + halfway);
    expect(typed()).toBe(7);

    store.pause(5000 + halfway);
    store.tick(5000 + halfway + 60_000);
    expect(typed()).toBe(7);

    // Resuming continues from where the CPU was: the pause is not run time.
    store.resume(5000 + halfway + 60_000);
    // 1 ms of slack: the sum of these floats can land a hair under the key's time.
    store.tick(5000 + halfway + 60_000 + (timeline[8] ?? 0) - halfway + 1);
    expect(typed()).toBe(9);
  });

  it('freezes the CPU when the player ends the run early', () => {
    const store = createRunStore({ ...CPU_RUN, cpuLevel: 1 }, 0);
    const opponent = store.opponent;
    if (opponent === null) throw new Error('expected an opponent');
    // A level-1 CPU has typed nothing in the first 100 ms; the player finishes both blocks then.
    let now = 0;
    for (const key of ['i', 'f', '(', 'a', '{', 'Enter', 'b', 'Enter', 'a', ':', ' ', '1']) {
      store.press(key, now);
      now += 10;
    }
    expect(store.getSnapshot().endedBy).toBe('blocks');
    const frozen = sessionCounters(opponent.getSnapshot()).raw;
    store.tick(now + 100_000);
    expect(sessionCounters(opponent.getSnapshot()).raw).toBe(frozen);
  });
});
