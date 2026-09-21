import { TRACKS, TRACK_POOLS } from '@typing-trainer/contracts';
import { describe, expect, it } from 'vitest';

import {
  RATING_LANGUAGE_COUNTS,
  RATING_LANGUAGE_MAX,
  cpuRating,
  maxTotalRating,
  rankOf,
  rankSteps,
  ratingDelta,
  totalRating,
} from '../src';

/** The code track's language count, which the tests below of the overall rating are written for. */
const CODE = RATING_LANGUAGE_COUNTS.code;

describe('the language count setting', () => {
  it.each(TRACKS)('matches the pools of the %s track', (track) => {
    expect(RATING_LANGUAGE_COUNTS[track]).toBe(TRACK_POOLS[track].length);
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
    expect(totalRating([], CODE)).toBe(0);
  });

  it('counts a single language at half, so a maxed one is 1000', () => {
    expect(totalRating([2000], CODE)).toBe(1000);
    expect(totalRating([2000, 0, 0, 0], CODE)).toBe(1000);
  });

  it('weighs languages from best to worst whatever the order given', () => {
    expect(totalRating([500, 2000], CODE)).toBe(totalRating([2000, 500], CODE));
    expect(totalRating([2000, 500], CODE)).toBe(1000 + 500 * 0.4);
  });

  it('reaches the ceiling only with every language maxed', () => {
    expect(totalRating([2000, 2000, 2000, 2000], CODE)).toBe(2952);
    expect(totalRating([2000, 2000, 2000, 1900], CODE)).toBeLessThan(2952);
  });

  it('rates breadth above depth', () => {
    expect(totalRating([1000, 1000, 1000, 1000], CODE)).toBeGreaterThan(totalRating([2000], CODE));
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
    const steps = rankSteps(CODE);
    expect(steps).toHaveLength(31);
    expect(steps[0]).toMatchObject({ tier: 'beginner', division: 1, min: 0 });
    expect(steps[30]).toMatchObject({ tier: 'master', division: null });
    steps.slice(1).forEach((step, index) => {
      expect(step.min).toBeGreaterThan(steps[index]?.min ?? Infinity);
    });
  });

  it('lays the thresholds for four languages out as announced', () => {
    const min = (tier: string, division: number | null) =>
      rankSteps(CODE).find((step) => step.tier === tier && step.division === division)?.min;
    expect(min('bronze', 1)).toBe(295);
    expect(min('silver', 1)).toBe(664);
    expect(min('gold', 1)).toBe(1107);
    expect(min('platinum', 1)).toBe(1624);
    expect(min('diamond', 1)).toBe(2214);
    expect(min('master', null)).toBe(2878);
  });

  it('puts a new player in beginner 1 and a maxed single language in silver 4', () => {
    expect(rankOf(0, CODE)).toMatchObject({ tier: 'beginner', division: 1 });
    expect(rankOf(totalRating([2000], CODE), CODE)).toMatchObject({ tier: 'silver', division: 4 });
  });

  it('puts every language maxed in master', () => {
    expect(rankOf(2952, CODE)).toMatchObject({ tier: 'master', division: null, progress: 1 });
    expect(rankOf(2952, CODE).next).toBeNull();
  });

  it('reports the next rank and the progress towards it', () => {
    const standing = rankOf(100, CODE);
    expect(standing).toMatchObject({ tier: 'beginner', division: 2, min: 59, nextMin: 118 });
    expect(standing.next).toEqual({ tier: 'beginner', division: 3 });
    expect(standing.progress).toBeCloseTo((100 - 59) / (118 - 59));
  });

  it('moves a player down when a language is added and the ceiling rises', () => {
    const total = totalRating([2000, 2000, 2000, 2000], CODE);
    expect(rankOf(total, 4).tier).toBe('master');
    expect(rankOf(total, 5).tier).toBe('diamond');
  });
});

describe('a natural-language track', () => {
  const NATURAL = RATING_LANGUAGE_COUNTS['natural-ja'];

  it('has three languages, the kinds of text, and a lower ceiling than code', () => {
    expect(RATING_LANGUAGE_COUNTS['natural-en']).toBe(3);
    expect(maxTotalRating(NATURAL)).toBe(2440);
    expect(totalRating([2000, 2000, 2000], NATURAL)).toBe(2440);
  });

  it('lays the thresholds for three languages out on its own ceiling', () => {
    const min = (tier: string, division: number | null) =>
      rankSteps(NATURAL).find((step) => step.tier === tier && step.division === division)?.min;
    expect(min('bronze', 1)).toBe(244);
    expect(min('silver', 1)).toBe(549);
    expect(min('gold', 1)).toBe(915);
    expect(min('platinum', 1)).toBe(1342);
    expect(min('diamond', 1)).toBe(1830);
    expect(min('master', null)).toBe(2379);
  });

  it('is master only with every kind maxed, where four languages would not be', () => {
    expect(rankOf(2440, NATURAL)).toMatchObject({ tier: 'master', division: null });
    expect(rankOf(2440, CODE).tier).not.toBe('master');
    expect(rankOf(2952, CODE).tier).toBe('master');
  });
});
