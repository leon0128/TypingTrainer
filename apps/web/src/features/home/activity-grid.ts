import type { ActivityResponse } from '@typing-trainer/contracts';

/** How dark a cell is: 0 for no run, and 1 to 4 by how many runs the day had. */
export type Level = 0 | 1 | 2 | 3 | 4;

/** The shade of a day with this many runs of one kind: 1, 2-3, 4-6, and 7 or more (§13.9). */
export function levelOf(count: number): Level {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

export interface GridCell {
  /** `YYYY-MM-DD`. */
  readonly date: string;
  /** Whether the day is in the range that was read; the first and last week may hold days outside. */
  readonly inRange: boolean;
  readonly code: number;
  readonly natural: number;
}

export interface GridModel {
  /** One array of seven days, Sunday first (§6.1), per week, oldest week first. */
  readonly weeks: readonly (readonly GridCell[])[];
  /** Where a month label goes: the week whose days include the first of that month. */
  readonly months: readonly { readonly column: number; readonly month: number }[];
  readonly runs: number;
  readonly days: number;
}

const DAY_MS = 86_400_000;
const utc = (date: string): number => Date.parse(`${date}T00:00:00Z`);
const addDays = (date: string, delta: number): string =>
  new Date(utc(date) + delta * DAY_MS).toISOString().slice(0, 10);

/**
 * Lays the days out as GitHub does: a column per week, a row per day, weeks starting on Sunday. The
 * first column begins on the Sunday on or before the range's start, so the days before the range
 * are blank; the same goes for the days after its end in the last one.
 */
export function buildGrid(activity: ActivityResponse): GridModel {
  const { from, to } = activity;
  const counts = new Map(activity.days.map((day) => [day.date, day] as const));
  const first = addDays(from, -new Date(utc(from)).getUTCDay());
  const columns = Math.floor((utc(to) - utc(first)) / DAY_MS / 7) + 1;

  const weeks: GridCell[][] = [];
  const months: { column: number; month: number }[] = [];
  for (let column = 0; column < columns; column += 1) {
    const week: GridCell[] = [];
    for (let row = 0; row < 7; row += 1) {
      const date = addDays(first, column * 7 + row);
      const inRange = date >= from && date <= to;
      const day = counts.get(date);
      week.push({
        date,
        inRange,
        code: inRange ? (day?.code ?? 0) : 0,
        natural: inRange ? (day?.natural ?? 0) : 0,
      });
      if (inRange && date.endsWith('-01')) {
        months.push({ column, month: Number(date.slice(5, 7)) - 1 });
      }
    }
    weeks.push(week);
  }
  // A label for the first week too, unless a month starts within the first three columns.
  const firstMonth = months[0];
  if (firstMonth === undefined || firstMonth.column >= 3) {
    months.unshift({ column: 0, month: Number(from.slice(5, 7)) - 1 });
  }

  let runs = 0;
  let days = 0;
  for (const day of activity.days) {
    runs += day.code + day.natural;
    if (day.code + day.natural > 0) days += 1;
  }
  return { weeks, months, runs, days };
}

/** The classes of a cell that is in the range: which kinds of run it had, for the colours (§13.9). */
export function cellClassName(cell: Pick<GridCell, 'code' | 'natural'>): string {
  return [
    'activity-cell',
    ...(cell.code > 0 ? ['has-code'] : []),
    ...(cell.natural > 0 ? ['has-natural'] : []),
  ].join(' ');
}
