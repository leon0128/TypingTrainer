import type { TypingProgram } from '@typing-trainer/contracts';

import { cpuKeys } from './cpu';

/**
 * The run time at which the Ghost types each key of `cpuKeys(programs)` (§4.4): one key every
 * `60000 / recordedScore` milliseconds, starting from the player's first key, with no variation.
 *
 * The Ghost never misses, so its score equals its KPM, and pacing it by the record's *score* makes
 * its final score exactly the record (Q32). The k-th key falls at `k × 120000 / (2 × score)`, so
 * `2 × score − 1` keys land before the 120-second mark, and `cpuScore` turns that into a score of
 * exactly `score` (a half rounds up). The key that would land on the mark itself is excluded, as
 * it is for a player's key.
 *
 * If the blocks run out before the time does, the Ghost simply stops, and its score is what it
 * typed: the server judges by the timeline it computes, so a short pool cannot inflate it.
 */
export function ghostTimeline(
  programs: readonly TypingProgram[],
  recordedScore: number,
): Float64Array {
  if (!Number.isInteger(recordedScore) || recordedScore < 1) {
    throw new RangeError(
      `A Ghost is paced by a record of at least 1, not ${String(recordedScore)}`,
    );
  }
  const intervalMs = 60_000 / recordedScore;
  const keyCount = cpuKeys(programs).length;
  return Float64Array.from({ length: keyCount }, (_, index) => (index + 1) * intervalMs);
}
