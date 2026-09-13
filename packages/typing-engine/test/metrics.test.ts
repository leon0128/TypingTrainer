import { describe, expect, it } from 'vitest';

import { computeAccuracy } from '../src';

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
