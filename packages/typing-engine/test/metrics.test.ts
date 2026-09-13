import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { PLAY_DURATION_MS, computeAccuracy, computeMetrics } from '../src';

describe('computeAccuracy', () => {
  it('is effective / (effective + miss)', () => {
    expect(computeAccuracy({ effective: 90, miss: 10 })).toBe(0.9);
    expect(computeAccuracy({ effective: 5, miss: 0 })).toBe(1);
    expect(computeAccuracy({ effective: 0, miss: 3 })).toBe(0);
  });

  it('is 0 when nothing has been typed', () => {
    expect(computeAccuracy({ effective: 0, miss: 0 })).toBe(0);
  });
});

describe('computeMetrics (§3.6)', () => {
  it('uses the fixed 120-second run', () => {
    expect(PLAY_DURATION_MS).toBe(120_000);
  });

  it('derives KPM, accuracy, miss rate, and score', () => {
    expect(computeMetrics({ effective: 400, miss: 20, raw: 430 })).toEqual({
      effective: 400,
      miss: 20,
      raw: 430,
      kpm: 200,
      accuracy: 400 / 420,
      missRate: 1 - 400 / 420,
      score: 190, // 200 × 0.952… = 190.47…
    });
  });

  it('keeps an odd effective count as a half KPM', () => {
    expect(computeMetrics({ effective: 151, miss: 0, raw: 151 }).kpm).toBe(75.5);
  });

  it('is all zeros when nothing has been typed', () => {
    expect(computeMetrics({ effective: 0, miss: 0, raw: 0 })).toEqual({
      effective: 0,
      miss: 0,
      raw: 0,
      kpm: 0,
      accuracy: 0,
      missRate: 0,
      score: 0,
    });
  });

  it.each([
    // Exact halves where multiplying the float KPM by the float accuracy lands just below .5.
    [165, 60, 60.49999999999999, 61],
    [99, 264, 13.499999999999998, 14],
    [350, 150, 122.49999999999999, 123],
  ])(
    'rounds effective %i, miss %i up to the integer ratio (float product %d)',
    (effective, miss, floatProduct, score) => {
      expect((effective / 2) * (effective / (effective + miss))).toBe(floatProduct);
      expect(computeMetrics({ effective, miss, raw: effective + miss }).score).toBe(score);
    },
  );

  it('matches round-half-up of the exact rational score for any counters', () => {
    fc.assert(
      fc.property(fc.nat({ max: 5_000 }), fc.nat({ max: 5_000 }), (effective, miss) => {
        const attempts = effective + miss;
        // round(e² / (2a)) half up, in integers: floor((2e² + 2a) / (4a)).
        const expected =
          attempts === 0
            ? 0
            : Math.floor((2 * effective * effective + 2 * attempts) / (4 * attempts));
        expect(computeMetrics({ effective, miss, raw: attempts }).score).toBe(expected);
      }),
      { numRuns: 2_000 },
    );
  });
});
