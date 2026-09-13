import type { KeystrokeCounters } from './engine';

/** `effective / (effective + miss)` (§3.6), defined as 0 when nothing has been typed. */
export function computeAccuracy(counters: Pick<KeystrokeCounters, 'effective' | 'miss'>): number {
  const attempts = counters.effective + counters.miss;
  return attempts === 0 ? 0 : counters.effective / attempts;
}
