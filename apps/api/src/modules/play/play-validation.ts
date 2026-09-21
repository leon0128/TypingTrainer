import type { SessionLog } from '@typing-trainer/contracts';
import { IDLE_LIMIT_MS, sessionIdleMs, type SessionReplay } from '@typing-trainer/typing-engine';

import { PLAUSIBILITY_LIMITS } from './plausibility-limits';

/** Why a submitted result was refused; sent to the client and logged with the numbers. */
export type RejectionReason =
  'log-start' | 'keys-after-end' | 'run-time' | 'idle' | 'speed' | 'progress';

export interface Rejection {
  readonly reason: RejectionReason;
  /** The measured values, for the log only. */
  readonly detail: string;
}

/**
 * Checks a replayed run for what a real run cannot do (§9.8). The counters themselves are never
 * taken from the client: they come from replaying the log against the issued blocks.
 */
export function checkPlausibility(
  log: SessionLog,
  replay: SessionReplay,
  wallElapsedMs: number,
): Rejection | undefined {
  const limits = PLAUSIBILITY_LIMITS;

  // The countdown starts with the first key, so the first delta is 0 (§4.1).
  if (log.deltas[0] !== 0) {
    return { reason: 'log-start', detail: `first delta ${String(log.deltas[0])} ms` };
  }
  if (replay.expiredKeys > limits.maxKeysAfterEnd) {
    return { reason: 'keys-after-end', detail: `${String(replay.expiredKeys)} keys after the end` };
  }
  if (replay.lastKeyMs > wallElapsedMs + limits.wallClockToleranceMs) {
    return {
      reason: 'run-time',
      detail: `${String(replay.lastKeyMs)} ms of run time in ${String(wallElapsedMs)} ms`,
    };
  }
  const idleMs = sessionIdleMs(wallElapsedMs, replay.lastKeyMs);
  if (idleMs > IDLE_LIMIT_MS + limits.idleGraceMs) {
    return { reason: 'idle', detail: `${String(idleMs)} ms idle` };
  }
  if (replay.intervals.peakKpm10s > limits.maxPeakKpm10s) {
    return {
      reason: 'speed',
      detail: `${String(replay.intervals.peakKpm10s)} KPM in a 10-second window`,
    };
  }
  if (replay.metrics.kpm > limits.maxRunKpm) {
    return { reason: 'speed', detail: `${String(replay.metrics.kpm)} KPM over the run` };
  }
  // The engine cannot count more effective keys than the blocks reached hold; checked anyway, so a
  // future engine change cannot quietly inflate a score. The ceiling is the longest way to type the
  // blocks: a Japanese run counts every key pressed, so spelling `shi` for し (three keys) reaches
  // past the shortest route (§13.5). For code and English the two are the same.
  if (replay.counters.effective > replay.maxReached) {
    return {
      reason: 'progress',
      detail: `${String(replay.counters.effective)} effective keys in ${String(
        replay.maxReached,
      )} at most`,
    };
  }
  return undefined;
}
