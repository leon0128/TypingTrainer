import { z } from 'zod';

import { ContentLanguageSchema } from './content-bundle';
import { RankingPeriodSchema } from './rankings';

/** The longest window `daily` may cover, so its raw points stay readable (§6.2). */
export const DASHBOARD_MAX_DAILY_DAYS = 31;

/** A calendar date that exists, as `YYYY-MM-DD` — a day in the player's profile time zone (§6.4). */
export const LocalDateSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  // A month or day out of range is an Invalid Date, whose toISOString() throws instead of failing.
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'must be a calendar date, YYYY-MM-DD');

/**
 * Query of `GET /api/dashboard` (§9.5, §6.2). `from` and `to` are inclusive local dates.
 *
 * - `daily`: runs from `from` to `to`, both defaulting to today.
 * - `weekly`: the Sunday–Saturday week containing `from` (default: this week); `to` is not allowed.
 * - `total`: days played between `from` and `to`, either of which may be omitted.
 */
export const DashboardRequestSchema = z
  .object({
    period: RankingPeriodSchema,
    language: ContentLanguageSchema,
    from: LocalDateSchema.optional(),
    to: LocalDateSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.period === 'weekly' && value.to !== undefined) {
      context.addIssue({ code: 'custom', path: ['to'], message: 'is not used by weekly' });
    }
    if (value.from !== undefined && value.to !== undefined && value.from > value.to) {
      context.addIssue({ code: 'custom', path: ['to'], message: 'must not be before from' });
    }
    if (
      value.period === 'daily' &&
      value.from !== undefined &&
      value.to !== undefined &&
      (Date.parse(value.to) - Date.parse(value.from)) / 86_400_000 >= DASHBOARD_MAX_DAILY_DAYS
    ) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: `daily covers at most ${String(DASHBOARD_MAX_DAILY_DAYS)} days`,
      });
    }
  });

/**
 * One chart point. `x` is the run's start time (ISO datetime) for `daily` and a local date for
 * `weekly` and `total`; `score` is null only for a `weekly` day with no run.
 */
export const DashboardPointSchema = z.object({
  x: z.string(),
  score: z.int().nonnegative().nullable(),
});

export const DashboardSummarySchema = z.object({
  totalRuns: z.int().nonnegative(),
  totalKeystrokes: z.int().nonnegative(),
  bestScores: z.array(z.object({ language: ContentLanguageSchema, score: z.int().nonnegative() })),
  /** The highest CPU level beaten in any language (§6.2); null when none has been. */
  highestCpuLevelBeaten: z.int().positive().nullable(),
});

export const DashboardResponseSchema = z.object({
  period: RankingPeriodSchema,
  language: ContentLanguageSchema,
  /** The window actually used, after defaults were applied. `to` is null for an open `total`. */
  from: LocalDateSchema.nullable(),
  to: LocalDateSchema.nullable(),
  points: z.array(DashboardPointSchema),
  summary: DashboardSummarySchema,
});

export type DashboardRequest = z.output<typeof DashboardRequestSchema>;
export type DashboardPoint = z.infer<typeof DashboardPointSchema>;
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
