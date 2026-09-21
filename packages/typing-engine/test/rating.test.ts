import { CONTENT_LANGUAGES } from '@typing-trainer/contracts';
import { describe, expect, it } from 'vitest';

import {
  RATING_LANGUAGE_COUNT,
  RATING_LANGUAGE_MAX,
  cpuRating,
  maxTotalRating,
  rankOf,
  rankSteps,
  ratingDelta,
  totalRating,
} from '../src';

describe('the language count setting', () => {
  it('matches the languages the app has', () => {
    expect(RATING_LANGUAGE_COUNT).toBe(CONTENT_LANGUAGES.length);
  });
});

describe('cpuRating', () => {
  it('is 20 a level, from 20 to 2000', () => {
    expect(cpuRating(1)).toBe(20);
    expect(cpuRating(100)).toBe(2000);
  });

  it.each([0, 101, 1.5])('refuses level %s', (level) => {
    expect(() => cpuRating(level)).toThrow(RangeError);
  });
});

describe('ratingDelta', () => {
  const base = { rating: 0, gamesPlayed: 0, cpuLevel: 1 };

  it('pays about half of K for an even match', () => {
    // At 0 against a 20 CPU the win chance is a shade under half.
    expect(ratingDelta({ ...base, won: true })).toBe(21);
  });

  it('never takes a rating below 0', () => {
    expect(ratingDelta({ ...base, won: false })).toBe(0);
    expect(ratingDelta({ ...base, rating: 5, won: false })).toBe(-5);
  });

  it('pays more for a stronger CPU and less for a weaker one', () => {
    const rating = 1000;
    const strong = ratingDelta({ rating, gamesPlayed: 20, cpuLevel: 80, won: true });
    const even = ratingDelta({ rating, gamesPlayed: 20, cpuLevel: 50, won: true });
    const weak = ratingDelta({ rating, gamesPlayed: 20, cpuLevel: 10, won: true });
    expect(strong).toBeGreaterThan(even);
    expect(even).toBeGreaterThan(weak);
    expect(weak).toBe(0);
  });

  it('costs more to lose to a weaker CPU than to a stronger one', () => {
    const rating = 1000;
    const toWeak = ratingDelta({ rating, gamesPlayed: 20, cpuLevel: 20, won: false });
    const toStrong = ratingDelta({ rating, gamesPlayed: 20, cpuLevel: 80, won: false });
    expect(toWeak).toBeLessThan(toStrong);
    expect(toStrong).toBeLessThan(1);
  });

  it('moves twice as fast for the first ten matches', () => {
    const args = { rating: 1000, cpuLevel: 50, won: true } as const;
    expect(ratingDelta({ ...args, gamesPlayed: 9 })).toBe(20);
    expect(ratingDelta({ ...args, gamesPlayed: 10 })).toBe(10);
  });

  it('never goes above the language maximum', () => {
    expect(ratingDelta({ rating: 1995, gamesPlayed: 0, cpuLevel: 100, won: true })).toBe(5);
    expect(
      ratingDelta({ rating: RATING_LANGUAGE_MAX, gamesPlayed: 0, cpuLevel: 100, won: true }),
    ).toBe(0);
  });
});

describe('totalRating', () => {
  it('is 0 with nothing played', () => {
    expect(totalRating([])).toBe(0);
  });

  it('counts a single language at half, so a maxed one is 1000', () => {
    expect(totalRating([2000])).toBe(1000);
    expect(totalRating([2000, 0, 0, 0])).toBe(1000);
  });

  it('weighs languages from best to worst whatever the order given', () => {
    expect(totalRating([500, 2000])).toBe(totalRating([2000, 500]));
    expect(totalRating([2000, 500])).toBe(1000 + 500 * 0.4);
  });

  it('reaches the ceiling only with every language maxed', () => {
    expect(totalRating([2000, 2000, 2000, 2000])).toBe(2952);
    expect(totalRating([2000, 2000, 2000, 1900])).toBeLessThan(2952);
  });

  it('rates breadth above depth', () => {
    expect(totalRating([1000, 1000, 1000, 1000])).toBeGreaterThan(totalRating([2000]));
  });

  it('is unchanged when a language is added that has not been played', () => {
    const ratings = [1400, 900, 300];
    expect(totalRating(ratings, 4)).toBe(totalRating(ratings, 5));
  });
});

describe('maxTotalRating', () => {
  it.each([
    [1, 1000],
    [2, 1800],
    [3, 2440],
    [4, 2952],
    [5, 3362],
  ])('is %i languages -> %i', (count, expected) => {
    expect(maxTotalRating(count)).toBe(expected);
  });
});

describe('ranks', () => {
  it('has 31 steps, rising, from beginner 1 to master', () => {
    const steps = rankSteps();
    expect(steps).toHaveLength(31);
    expect(steps[0]).toMatchObject({ tier: 'beginner', division: 1, min: 0 });
    expect(steps[30]).toMatchObject({ tier: 'master', division: null });
    steps.slice(1).forEach((step, index) => {
      expect(step.min).toBeGreaterThan(steps[index]?.min ?? Infinity);
    });
  });

  it('lays the thresholds for four languages out as announced', () => {
    const min = (tier: string, division: number | null) =>
      rankSteps().find((step) => step.tier === tier && step.division === division)?.min;
    expect(min('bronze', 1)).toBe(295);
    expect(min('silver', 1)).toBe(664);
    expect(min('gold', 1)).toBe(1107);
    expect(min('platinum', 1)).toBe(1624);
    expect(min('diamond', 1)).toBe(2214);
    expect(min('master', null)).toBe(2878);
  });

  it('puts a new player in beginner 1 and a maxed single language in silver 4', () => {
    expect(rankOf(0)).toMatchObject({ tier: 'beginner', division: 1 });
    expect(rankOf(totalRating([2000]))).toMatchObject({ tier: 'silver', division: 4 });
  });

  it('puts every language maxed in master', () => {
    expect(rankOf(2952)).toMatchObject({ tier: 'master', division: null, progress: 1 });
    expect(rankOf(2952).next).toBeNull();
  });

  it('reports the next rank and the progress towards it', () => {
    const standing = rankOf(100);
    expect(standing).toMatchObject({ tier: 'beginner', division: 2, min: 59, nextMin: 118 });
    expect(standing.next).toEqual({ tier: 'beginner', division: 3 });
    expect(standing.progress).toBeCloseTo((100 - 59) / (118 - 59));
  });

  it('moves a player down when a language is added and the ceiling rises', () => {
    const total = totalRating([2000, 2000, 2000, 2000]);
    expect(rankOf(total, 4).tier).toBe('master');
    expect(rankOf(total, 5).tier).toBe('diamond');
  });
});
