/** Adds days to a `YYYY-MM-DD` date; calendar arithmetic only, no time zone involved. */
export function addDays(date: string, delta: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + delta);
  return moved.toISOString().slice(0, 10);
}
