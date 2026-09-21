import { z } from 'zod';

import { LocalDateSchema } from './dashboard';

/** The play-history grid shows a year: 365 days, ending today unless asked otherwise (§13.9). */
export const ACTIVITY_DEFAULT_DAYS = 365;
/** The longest range that may be asked for, so a request cannot make the server add up years. */
export const ACTIVITY_MAX_DAYS = 366;

/**
 * Query of `GET /api/activity` (§13.8). `from` and `to` are inclusive local dates in the player's
 * profile time zone (§6.4). With neither, the range is the last 365 days up to today; with only
 * `to`, the 365 days ending there; with only `from`, the 365 days starting there.
 */
export const ActivityRequestSchema = z
  .object({
    from: LocalDateSchema.optional(),
    to: LocalDateSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.from === undefined || value.to === undefined) return;
    if (value.from > value.to) {
      context.addIssue({ code: 'custom', path: ['to'], message: 'must not be before from' });
    } else if ((Date.parse(value.to) - Date.parse(value.from)) / 86_400_000 >= ACTIVITY_MAX_DAYS) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: `covers at most ${String(ACTIVITY_MAX_DAYS)} days`,
      });
    }
  });

/**
 * The runs played on one local date: in the programming languages, and in the natural-language
 * pools together (§13.9). A day with runs of both shows both.
 */
export const ActivityDaySchema = z.object({
  date: LocalDateSchema,
  code: z.int().nonnegative(),
  natural: z.int().nonnegative(),
});

/** Body of `GET /api/activity`: the range that was read, and the days in it that have runs. */
export const ActivityResponseSchema = z.object({
  from: LocalDateSchema,
  to: LocalDateSchema,
  days: z.array(ActivityDaySchema),
});

export type ActivityRequest = z.output<typeof ActivityRequestSchema>;
export type ActivityDay = z.infer<typeof ActivityDaySchema>;
export type ActivityResponse = z.infer<typeof ActivityResponseSchema>;
