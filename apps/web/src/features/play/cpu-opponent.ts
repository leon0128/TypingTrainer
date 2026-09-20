import type { StartSessionResponse } from '@typing-trainer/contracts';
import {
  computeMetrics,
  cpuKeys,
  cpuTimeline,
  createSession,
  endSessionByTime,
  PLAY_DURATION_MS,
  sessionCounters,
  sessionKey,
  type OfficialMetrics,
  type SessionState,
} from '@typing-trainer/typing-engine';

export interface CpuOpponent {
  readonly level: number;
  // Function properties rather than methods: both are passed unbound to useSyncExternalStore.
  readonly getSnapshot: () => SessionState;
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * Types every key the CPU has reached by `runMs` of the player's run time. Only moves forward,
   * and subscribers are told once however many keys that was.
   */
  advanceTo(runMs: number): void;
  /** The official formulas over the CPU's progress; it never misses (Q28). */
  liveMetrics(): OfficialMetrics;
}

/**
 * The opponent of a vs CPU run. It replays the CPU's keys through the same session engine the
 * player uses, so auto-insertion, block changes, and the counters behave identically, and the
 * timeline is the one the server computes from the same seed to judge the match (§4.3.3).
 */
export function createCpuOpponent(issued: StartSessionResponse, level: number): CpuOpponent {
  const keys = cpuKeys(issued.blocks);
  const timeline = cpuTimeline(issued.blocks, level, BigInt(issued.seed));
  const listeners = new Set<() => void>();
  let session = createSession(issued.blocks);
  let next = 0;

  return {
    level,
    getSnapshot: () => session,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    advanceTo(runMs) {
      let state = session;
      while (
        state.endedBy === null &&
        next < keys.length &&
        (timeline[next] ?? Infinity) <= runMs
      ) {
        state = sessionKey(state, keys[next] ?? '', timeline[next] ?? 0).state;
        next += 1;
      }
      if (runMs >= PLAY_DURATION_MS) state = endSessionByTime(state);
      if (state === session) return;
      session = state;
      for (const listener of listeners) listener();
    },
    liveMetrics: () => computeMetrics(sessionCounters(session)),
  };
}
