import type { StartSessionResponse } from '@typing-trainer/contracts';
import {
  IDLE_LIMIT_MS,
  PLAY_DURATION_MS,
  cpuScore,
  cpuTimeline,
  ghostTimeline,
  sessionCounters,
} from '@typing-trainer/typing-engine';
import { describe, expect, it } from 'vitest';

import { createOpponent, type Opponent } from '../src/features/play/opponent';
import { createRunStore } from '../src/features/play/run-store';
import { IF_PROGRAM, PADDED_PROGRAM } from './program-fixture';

const BLOCKS = [IF_PROGRAM, PADDED_PROGRAM];

const CPU_RUN: StartSessionResponse = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  language: 'python',
  mode: 'cpu',
  cpuLevel: 60,
  ghostPeriod: null,
  ghostScore: null,
  seed: '42',
  contentRevision: 'a'.repeat(64),
  blocks: BLOCKS,
  durationMs: PLAY_DURATION_MS,
  idleLimitMs: IDLE_LIMIT_MS,
};

const timeline = cpuTimeline(BLOCKS, 60, 42n);
/** The opponent of a run that has one; every run in these tests does. */
function opponentOf(issued: StartSessionResponse): Opponent {
  const opponent = createOpponent(issued);
  if (opponent === null) throw new Error('expected an opponent');
  return opponent;
}

const effectiveOf = (opponent: Opponent) => sessionCounters(opponent.getSnapshot()).effective;

describe('the CPU opponent', () => {
  it('has typed nothing until the first key is due', () => {
    const opponent = opponentOf(CPU_RUN);
    opponent.advanceTo(0);
    expect(effectiveOf(opponent)).toBe(0);
    opponent.advanceTo((timeline[0] ?? 0) - 1);
    expect(effectiveOf(opponent)).toBe(0);
  });

  it('types exactly the keys whose time has come, and never misses', () => {
    const opponent = opponentOf(CPU_RUN);
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
    const opponent = opponentOf(long);
    opponent.advanceTo(PLAY_DURATION_MS);
    expect(opponent.getSnapshot().endedBy).toBe('time');
    expect(opponent.liveMetrics().accuracy).toBe(1);
    expect(opponent.liveMetrics().score).toBe(cpuScore(cpuTimeline(long.blocks, 1, 42n)));
  });

  it('notifies once per advance, not once per key, and not when nothing changed', () => {
    const opponent = opponentOf(CPU_RUN);
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

describe('the Ghost opponent', () => {
  const GHOST_RUN: StartSessionResponse = {
    ...CPU_RUN,
    mode: 'ghost',
    cpuLevel: null,
    ghostPeriod: 'weekly',
    ghostScore: 40,
  };
  const ghostTimes = ghostTimeline(BLOCKS, 40);

  it('is named for the record it reproduces', () => {
    expect(opponentOf(GHOST_RUN).label).toBe("Ghost · this week's best 40");
    expect(opponentOf({ ...GHOST_RUN, ghostPeriod: 'daily' }).label).toBe(
      "Ghost · today's best 40",
    );
    expect(opponentOf({ ...GHOST_RUN, ghostPeriod: 'total' }).label).toBe(
      'Ghost · all-time best 40',
    );
  });

  it('is not there in single play, or when the run names no record', () => {
    expect(createOpponent({ ...CPU_RUN, mode: 'single', cpuLevel: null })).toBeNull();
    expect(createOpponent({ ...GHOST_RUN, ghostScore: null })).toBeNull();
  });

  it('types one key every 60000 / record milliseconds, at the same times the server counts', () => {
    const opponent = opponentOf(GHOST_RUN);
    opponent.advanceTo(1499);
    expect(sessionCounters(opponent.getSnapshot()).raw).toBe(0);
    opponent.advanceTo(1500);
    expect(sessionCounters(opponent.getSnapshot()).raw).toBe(1);
    opponent.advanceTo(1500 * 6);
    expect(sessionCounters(opponent.getSnapshot()).raw).toBe(6);
    // It never misses (§4.4).
    expect(sessionCounters(opponent.getSnapshot()).miss).toBe(0);
  });

  it('scores exactly the record at the end of the run, when the blocks last', () => {
    const long = { ...GHOST_RUN, blocks: Array.from({ length: 20 }, () => IF_PROGRAM) };
    const opponent = opponentOf(long);
    opponent.advanceTo(PLAY_DURATION_MS);
    expect(opponent.liveMetrics().score).toBe(40);
    expect(opponent.liveMetrics().score).toBe(cpuScore(ghostTimeline(long.blocks, 40)));
  });

  it('follows the player: it starts with the first key and waits through a pause', () => {
    const store = createRunStore(GHOST_RUN, 0);
    const opponent = store.opponent;
    if (opponent === null) throw new Error('expected an opponent');
    const typed = () => sessionCounters(opponent.getSnapshot()).raw;

    store.tick(9000);
    expect(typed()).toBe(0);
    store.press('i', 9000);
    store.tick(9000 + (ghostTimes[3] ?? 0) + 1);
    expect(typed()).toBe(4);
    store.pause(9000 + (ghostTimes[3] ?? 0) + 1);
    store.tick(9000 + 90_000);
    expect(typed()).toBe(4);
  });
});
