import type { GhostPeriod, StartSessionResponse } from '@typing-trainer/contracts';
import {
  computeMetrics,
  cpuKeys,
  cpuTimeline,
  createSession,
  endSessionByTime,
  ghostTimeline,
  PLAY_DURATION_MS,
  sessionCounters,
  sessionKey,
  type OfficialMetrics,
  type SessionState,
} from '@typing-trainer/typing-engine';

/** How a Ghost's record is named beside its score, e.g. "today's best". */
export const GHOST_PERIOD_LABELS: Record<GhostPeriod, string> = {
  daily: "today's best",
  weekly: "this week's best",
  total: 'all-time best',
};

export interface Opponent {
  /** What the opponent is called on screen: "CPU Lv.50", or "Ghost · today's best 88". */
  readonly label: string;
  // Function properties rather than methods: both are passed unbound to useSyncExternalStore.
  readonly getSnapshot: () => SessionState;
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * Types every key the CPU has reached by `runMs` of the player's run time. Only moves forward,
   * and subscribers are told once however many keys that was.
   */
  advanceTo(runMs: number): void;
  /** The official formulas over the opponent's progress; it never misses (Q28, §4.4). */
  liveMetrics(): OfficialMetrics;
}

/**
 * The opponent of a vs CPU or Ghost run, or null for single play. It replays the opponent's keys
 * through the same session engine the player uses, so auto-insertion, block changes, and the
 * counters behave identically, and the timeline is the one the server computes from what it issued
 * — the seed and level for the CPU (§4.3.3), the record's score for the Ghost (§4.4) — to judge the
 * match.
 */
export function createOpponent(issued: StartSessionResponse): Opponent | null {
  if (issued.mode === 'cpu' && issued.cpuLevel !== null) {
    return replaying(
      issued,
      `CPU Lv.${String(issued.cpuLevel)}`,
      cpuTimeline(issued.blocks, issued.cpuLevel, BigInt(issued.seed)),
    );
  }
  if (issued.mode === 'ghost' && issued.ghostPeriod !== null && issued.ghostScore !== null) {
    return replaying(
      issued,
      `Ghost · ${GHOST_PERIOD_LABELS[issued.ghostPeriod]} ${String(issued.ghostScore)}`,
      ghostTimeline(issued.blocks, issued.ghostScore),
    );
  }
  return null;
}

function replaying(issued: StartSessionResponse, label: string, timeline: Float64Array): Opponent {
  const keys = cpuKeys(issued.blocks);
  const listeners = new Set<() => void>();
  let session = createSession(issued.blocks);
  let next = 0;

  return {
    label,
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
