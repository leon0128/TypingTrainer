import { IDLE_LIMIT_MS, PLAY_DURATION_MS } from '@typing-trainer/typing-engine';

/**
 * Limits for judging a submitted result (§9.8). They are estimates made before the service has
 * real play data: every one is far above what §4.3.1 records for the fastest humans, so a genuine
 * run should never reach them. If a legitimate run is ever rejected, adjust the value here — they
 * are deliberately in one place, and the tests build their cases from these constants.
 */
export const PLAUSIBILITY_LIMITS = {
  /**
   * Keys per minute in any 10-second window, counting every applied key. §4.3.1 puts the fastest
   * sustained human at roughly 1,500 KPM (305 WPM in a 15-second burst); 2,400 KPM is 40 keys a
   * second, about 1.6 times that peak.
   */
  maxPeakKpm10s: 2400,
  /**
   * Effective keys per minute over the whole run: twice the 800 KPM of CPU level 100 (§4.3.2),
   * which is itself set to "an even match against the fastest person alive".
   */
  maxRunKpm: 1600,
  /**
   * Keys logged after the run ended. The client stops logging when the countdown reaches zero or
   * the blocks run out, so any such key means the log was not produced by a run.
   */
  maxKeysAfterEnd: 0,
  /**
   * Run time may not exceed the wall-clock time since the run was issued. The tolerance covers the
   * difference between the client's monotonic clock and the database clock, plus the request time.
   */
  wallClockToleranceMs: 2000,
  /** Grace added to the 15-minute idle limit (§4.1) before the server rejects a run as idle. */
  idleGraceMs: 30_000,
} as const;

/**
 * How long after issuing a result is accepted (§9.8): the run itself, the idle limit, and 30
 * seconds of grace — 17 minutes 30 seconds.
 */
export const SUBMISSION_WINDOW_MS = PLAY_DURATION_MS + IDLE_LIMIT_MS + 30_000;
