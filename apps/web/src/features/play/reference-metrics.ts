/**
 * P0 reference measurements. These are NOT the official metrics: the 120-second run and the
 * §3.6 KPM and score formulas are introduced with the real play session in P1, in typing-engine.
 */

export interface LatencySummary {
  readonly samples: number;
  readonly maxMs: number;
  readonly p95Ms: number;
}

export interface ReferenceResult {
  readonly elapsedMs: number;
  /** Effective keystrokes per elapsed minute. */
  readonly referenceKpm: number;
  readonly accuracy: number;
  readonly effective: number;
  readonly canonical: number;
  readonly miss: number;
  readonly raw: number;
  readonly latency: LatencySummary;
}

export function referenceKpm(effective: number, elapsedMs: number): number {
  return elapsedMs <= 0 ? 0 : effective / (elapsedMs / 60_000);
}

/** Nearest-rank percentile; 0 for no samples. */
export function percentile(samples: readonly number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1] ?? 0;
}

export function summarizeLatency(samples: readonly number[]): LatencySummary {
  return {
    samples: samples.length,
    maxMs: samples.length === 0 ? 0 : Math.max(...samples),
    p95Ms: percentile(samples, 95),
  };
}
