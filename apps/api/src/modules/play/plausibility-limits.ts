import type { Track } from '@typing-trainer/contracts';
import { IDLE_LIMIT_MS, PLAY_DURATION_MS } from '@typing-trainer/typing-engine';

/** What a run of one track may not exceed (§9.8). */
export interface PlausibilityLimits {
  /** Keys per minute in any 10-second window, counting every applied key. */
  readonly maxPeakKpm10s: number;
  /** Effective keys per minute over the whole run. */
  readonly maxRunKpm: number;
  /**
   * Keys logged after the run ended. The client stops logging when the countdown reaches zero or
   * the blocks run out, so any such key means the log was not produced by a run.
   */
  readonly maxKeysAfterEnd: number;
  /**
   * Run time may not exceed the wall-clock time since the run was issued. The tolerance covers the
   * difference between the client's monotonic clock and the database clock, plus the request time.
   */
  readonly wallClockToleranceMs: number;
  /** Grace added to the 15-minute idle limit (§4.1) before the server rejects a run as idle. */
  readonly idleGraceMs: number;
}

/** The limits that do not depend on what is typed. */
const COMMON = { maxKeysAfterEnd: 0, wallClockToleranceMs: 2000, idleGraceMs: 30_000 } as const;

/**
 * Limits for judging a submitted result (§9.8), by track. They are estimates made before the
 * service has real play data: every one is far above what §4.3.1 records for the fastest humans, so
 * a genuine run should never reach them. If a legitimate run is ever rejected, adjust the value
 * here — they are deliberately in one place, and the tests build their cases from these constants.
 *
 * - `maxPeakKpm10s`: code is 2,400 KPM, 40 keys a second and about 1.6 times the fastest sustained
 *   human of §4.3.1 (roughly 1,500 KPM in a 15-second burst). Prose is typed about 1.5 times as
 *   fast as code, so its tracks allow 3,200 (§13.7).
 * - `maxRunKpm`: twice the speed of CPU level 100 (§4.3.2), which is itself "an even match against
 *   the fastest person alive": 1,600 for code (800) and 2,400 for prose (1,200).
 */
export const PLAUSIBILITY_LIMITS: Readonly<Record<Track, PlausibilityLimits>> = {
  code: { maxPeakKpm10s: 2400, maxRunKpm: 1600, ...COMMON },
  'natural-ja': { maxPeakKpm10s: 3200, maxRunKpm: 2400, ...COMMON },
  'natural-en': { maxPeakKpm10s: 3200, maxRunKpm: 2400, ...COMMON },
};

/** The limits of a track. There is no default: a run is judged by the track it was played in. */
export const plausibilityLimits = (track: Track): PlausibilityLimits => PLAUSIBILITY_LIMITS[track];

/**
 * How long after issuing a result is accepted (§9.8): the run itself, the idle limit, and 30
 * seconds of grace — 17 minutes 30 seconds.
 */
export const SUBMISSION_WINDOW_MS = PLAY_DURATION_MS + IDLE_LIMIT_MS + 30_000;
