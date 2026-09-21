import type { ActivityResponse } from '@typing-trainer/contracts';
import { describe, expect, it } from 'vitest';

import { buildGrid, levelOf } from '../src/features/home/activity-grid';

/**
 * Dates are chosen to sit in the middle of a week, apart from the Sunday the grid starts its weeks
 * on: 2026-03-11 is a Wednesday, so the first week has three days before the range.
 */
const activity = (overrides: Partial<ActivityResponse> = {}): ActivityResponse => ({
  from: '2026-03-11',
  to: '2027-03-10',
  days: [],
  ...overrides,
});

const dayOfWeek = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();

describe('levelOf', () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 2],
    [4, 3],
    [6, 3],
    [7, 4],
    [40, 4],
  ])('shades %i runs as %i', (count, level) => {
    expect(levelOf(count)).toBe(level);
  });

  it('gives no shade to a count that is not a run', () => {
    expect(levelOf(-1)).toBe(0);
  });
});

describe('buildGrid', () => {
  it('starts the weeks on Sunday, seven days each, one day after another', () => {
    const { weeks } = buildGrid(activity());
    for (const week of weeks) {
      expect(week).toHaveLength(7);
      expect(dayOfWeek(week[0]?.date ?? '')).toBe(0);
    }
    const dates = weeks.flat().map((cell) => cell.date);
    for (let index = 1; index < dates.length; index += 1) {
      const step =
        (Date.parse(`${dates[index] ?? ''}T00:00:00Z`) -
          Date.parse(`${dates[index - 1] ?? ''}T00:00:00Z`)) /
        86_400_000;
      expect(step).toBe(1);
    }
  });

  it('holds a year in 53 columns, blank before the start and after the end', () => {
    const { weeks } = buildGrid(activity());
    expect(weeks).toHaveLength(53);
    const cells = weeks.flat();
    expect(cells[0]?.date).toBe('2026-03-08');
    expect(cells.slice(0, 3).map((cell) => cell.inRange)).toEqual([false, false, false]);
    expect(cells[3]?.date).toBe('2026-03-11');
    expect(cells[3]?.inRange).toBe(true);
    const last = weeks.at(-1) ?? [];
    expect(last[0]?.date).toBe('2027-03-07');
    expect(last.map((cell) => cell.inRange)).toEqual([true, true, true, true, false, false, false]);
    expect(cells.filter((cell) => cell.inRange)).toHaveLength(365);
  });

  it('places each day where its date is, with the counts it had', () => {
    const { weeks } = buildGrid(
      activity({
        days: [
          { date: '2026-09-20', code: 2, natural: 1 },
          { date: '2026-09-23', code: 0, natural: 5 },
        ],
      }),
    );
    const cells = new Map(weeks.flat().map((cell) => [cell.date, cell] as const));
    expect(cells.get('2026-09-20')).toMatchObject({ code: 2, natural: 1, inRange: true });
    expect(cells.get('2026-09-23')).toMatchObject({ code: 0, natural: 5 });
    expect(cells.get('2026-09-21')).toMatchObject({ code: 0, natural: 0 });
    // 2026-09-20 is a Sunday: the top of its column.
    expect(weeks.find((week) => week[0]?.date === '2026-09-20')).toBeDefined();
  });

  it('ignores a day outside the range', () => {
    const grid = buildGrid(activity({ days: [{ date: '2026-03-09', code: 4, natural: 4 }] }));
    const cell = grid.weeks.flat().find((entry) => entry.date === '2026-03-09');
    expect(cell).toMatchObject({ inRange: false, code: 0, natural: 0 });
  });

  it('adds up the runs and the days that had one', () => {
    const grid = buildGrid(
      activity({
        days: [
          { date: '2026-04-02', code: 2, natural: 1 },
          { date: '2026-04-03', code: 1, natural: 0 },
          { date: '2026-04-04', code: 0, natural: 0 },
        ],
      }),
    );
    expect(grid.runs).toBe(4);
    expect(grid.days).toBe(2);
  });

  it('labels a month at the week that holds its first day, and the first week when no month starts soon', () => {
    const { months } = buildGrid(activity());
    // From a Wednesday in March: April starts in column 3, so March is labelled at the start.
    expect(months.slice(0, 3)).toEqual([
      { column: 0, month: 2 },
      { column: 3, month: 3 },
      { column: 7, month: 4 },
    ]);
    expect(months).toHaveLength(13);
    // 2027-03-01 is a Monday, in the week that starts on Sunday 2027-02-28: 51 weeks after 2026-03-08.
    expect(months.at(-1)).toEqual({ column: 51, month: 2 });
  });

  it('does not label the first week again when a month starts within three columns', () => {
    const { months } = buildGrid(activity({ from: '2026-03-25', to: '2027-03-24' }));
    expect(months[0]).toEqual({ column: 1, month: 3 });
  });

  it('lays out a single day as one column', () => {
    const { weeks } = buildGrid({ from: '2026-09-23', to: '2026-09-23', days: [] });
    expect(weeks).toHaveLength(1);
    expect(weeks[0]?.filter((cell) => cell.inRange).map((cell) => cell.date)).toEqual([
      '2026-09-23',
    ]);
  });

  it('starts a week on the same Sunday when the range starts on one', () => {
    const { weeks } = buildGrid({ from: '2026-09-20', to: '2026-10-03', days: [] });
    expect(weeks).toHaveLength(2);
    expect(weeks[0]?.every((cell) => cell.inRange)).toBe(true);
  });
});
