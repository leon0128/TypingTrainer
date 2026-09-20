/**
 * The SQL condition that a run falls within a period (§6.1, §6.4): "today" and "this week" are
 * read from the database clock and the player's profile time zone, so they move the instant local
 * midnight passes and never depend on the application's clock. Weeks start on Sunday.
 *
 * `period` is a SQL expression for `'daily'`, `'weekly'`, or `'total'` — a parameter such as `$3`
 * or a literal — and a NULL period matches every run. The statement must alias the run `r` and the
 * run's user `u`. Rankings, history, and Ghost records all use this one definition, so they can
 * never disagree about what "this week" means.
 */
export function periodCondition(period: string): string {
  return `(
    ${period}::text IS NULL OR ${period}::text = 'total'
    OR (${period}::text = 'daily' AND r.local_date = (now() AT TIME ZONE u.timezone)::date)
    OR (${period}::text = 'weekly' AND r.local_week_start =
          (now() AT TIME ZONE u.timezone)::date
            - EXTRACT(DOW FROM now() AT TIME ZONE u.timezone)::int)
  )`;
}
