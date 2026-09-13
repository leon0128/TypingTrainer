import { describe, expect, it } from 'vitest';

import { percentile, referenceKpm, summarizeLatency } from '../src/features/play/reference-metrics';

describe('referenceKpm', () => {
  it('is effective keystrokes per elapsed minute', () => {
    expect(referenceKpm(150, 60_000)).toBe(150);
    expect(referenceKpm(150, 42_300)).toBeCloseTo(212.77, 2);
  });

  it('is 0 before any time has elapsed', () => {
    expect(referenceKpm(3, 0)).toBe(0);
  });
});

describe('latency summary', () => {
  it('uses the nearest-rank percentile', () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(samples, 95)).toBe(95);
    expect(percentile([5, 1, 3], 95)).toBe(5);
    expect(percentile([], 95)).toBe(0);
  });

  it('reports sample count, max, and p95', () => {
    expect(summarizeLatency([4, 2, 9, 3])).toEqual({ samples: 4, maxMs: 9, p95Ms: 9 });
    expect(summarizeLatency([])).toEqual({ samples: 0, maxMs: 0, p95Ms: 0 });
  });
});
