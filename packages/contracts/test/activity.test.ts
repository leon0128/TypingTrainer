import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_DEFAULT_DAYS,
  ACTIVITY_MAX_DAYS,
  ActivityRequestSchema,
  ActivityResponseSchema,
  LocalDateSchema,
} from '../src';

const parse = (input: unknown) => ActivityRequestSchema.safeParse(input);
const messages = (input: unknown) => parse(input).error?.issues.map((issue) => issue.message) ?? [];

describe('ActivityRequestSchema', () => {
  it('has a year as its default and a day more as its longest', () => {
    expect(ACTIVITY_DEFAULT_DAYS).toBe(365);
    expect(ACTIVITY_MAX_DAYS).toBe(366);
  });

  it.each([
    [{}],
    [{ from: '2026-01-01' }],
    [{ to: '2026-12-31' }],
    [{ from: '2026-03-01', to: '2026-03-01' }],
    [{ from: '2025-01-01', to: '2026-01-01' }],
    // 2028 is a leap year: 366 days from 2028-01-01 end on 2028-12-31.
    [{ from: '2028-01-01', to: '2028-12-31' }],
  ])('accepts %j', (input) => {
    expect(parse(input).success).toBe(true);
  });

  it('refuses a range that ends before it starts', () => {
    expect(messages({ from: '2026-03-02', to: '2026-03-01' })).toContain('must not be before from');
  });

  it('refuses more than 366 days, the day after the longest range being the first that is too long', () => {
    expect(parse({ from: '2025-01-01', to: '2026-01-01' }).success).toBe(true); // 366 days
    expect(messages({ from: '2025-01-01', to: '2026-01-02' })).toContain('covers at most 366 days');
    expect(parse({ from: '2020-01-01', to: '2026-01-01' }).success).toBe(false);
  });

  it.each([['2026-02-30'], ['2026-13-01'], ['26-01-01'], ['2026-1-1'], ['yesterday'], ['']])(
    'refuses the date "%s"',
    (date) => {
      expect(parse({ from: date }).success).toBe(false);
      expect(parse({ to: date }).success).toBe(false);
    },
  );
});

describe('ActivityResponseSchema', () => {
  it('has a range and the days that have runs', () => {
    expect(
      ActivityResponseSchema.safeParse({
        from: '2026-01-01',
        to: '2026-12-31',
        days: [{ date: '2026-03-04', code: 2, natural: 0 }],
      }).success,
    ).toBe(true);
    expect(
      ActivityResponseSchema.safeParse({
        from: '2026-01-01',
        to: '2026-12-31',
        days: [{ date: '2026-03-04', code: -1, natural: 0 }],
      }).success,
    ).toBe(false);
  });
});

describe('LocalDateSchema', () => {
  it.each([
    ['2026-13-01'],
    ['2026-00-10'],
    ['2026-04-31'],
    ['2026-02-29'],
    ['2026-01-00'],
    ['2026-01-32'],
  ])('refuses %s without throwing', (value) => {
    expect(() => LocalDateSchema.safeParse(value)).not.toThrow();
    expect(LocalDateSchema.safeParse(value).success).toBe(false);
  });

  it.each([['2026-01-31'], ['2028-02-29'], ['2026-12-31']])('accepts %s', (value) => {
    expect(LocalDateSchema.safeParse(value).success).toBe(true);
  });
});
