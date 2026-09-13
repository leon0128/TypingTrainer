import type { KeystrokeCounters } from './engine';

/** Every run lasts exactly this long (§4.1); an application constant, not a setting. */
export const PLAY_DURATION_MS = 120_000;

/** `effective / (effective + miss)` (§3.6), defined as 0 when nothing has been typed. */
export function computeAccuracy(counters: Pick<KeystrokeCounters, 'effective' | 'miss'>): number {
  const attempts = counters.effective + counters.miss;
  return attempts === 0 ? 0 : counters.effective / attempts;
}

/** The official metrics of a run (§3.6). */
export interface OfficialMetrics {
  readonly effective: number;
  readonly miss: number;
  readonly raw: number;
  /** Effective keystrokes per minute of the fixed run: `effective / 2`. */
  readonly kpm: number;
  readonly accuracy: number;
  /** `1 − accuracy`, and 0 when nothing has been typed. */
  readonly missRate: number;
  /** `round(kpm × accuracy)`, rounding halves up. */
  readonly score: number;
}

export function computeMetrics(
  counters: Pick<KeystrokeCounters, 'effective' | 'miss' | 'raw'>,
): OfficialMetrics {
  const { effective, miss, raw } = counters;
  const minutes = PLAY_DURATION_MS / 60_000;
  const attempts = effective + miss;
  const accuracy = computeAccuracy(counters);
  return {
    effective,
    miss,
    raw,
    kpm: effective / minutes,
    accuracy,
    missRate: attempts === 0 ? 0 : 1 - accuracy,
    // kpm × accuracy = effective² / (minutes × attempts). Dividing the two integers keeps an exact
    // half representable, whereas multiplying the floats can land just below it: for effective 165
    // and miss 60, 82.5 × 0.7333… is 60.49999999999999 and would round to 60 instead of 61.
    score: attempts === 0 ? 0 : Math.round((effective * effective) / (minutes * attempts)),
  };
}
