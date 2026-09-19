import { z } from 'zod';

import { ContentLanguageSchema } from './content-bundle';
import { PlayModeSchema } from './play';

/** The three periods a ranking or the dashboard can be viewed over (§6.1, §6.2). */
export const RankingPeriodSchema = z.enum(['daily', 'weekly', 'total']);

/** Query of `GET /api/rankings` (§9.5): both parameters are required. */
export const RankingsRequestSchema = z.object({
  period: RankingPeriodSchema,
  language: ContentLanguageSchema,
});

/** One run in a ranking: only what the list needs to display (§6.1). */
export const RankingEntrySchema = z.object({
  id: z.uuid(),
  mode: PlayModeSchema,
  startedAt: z.iso.datetime(),
  score: z.int().nonnegative(),
  kpm: z.number().nonnegative(),
  accuracy: z.number().min(0).max(1),
});

/**
 * The signed-in user's own top 10 runs for the period and language (§6.1). Rankings are never
 * about other players — this is a personal best list, not a leaderboard.
 */
export const RankingsResponseSchema = z.object({
  period: RankingPeriodSchema,
  language: ContentLanguageSchema,
  entries: z.array(RankingEntrySchema).max(10),
});

export type RankingPeriod = z.infer<typeof RankingPeriodSchema>;
export type RankingsRequest = z.output<typeof RankingsRequestSchema>;
export type RankingEntry = z.infer<typeof RankingEntrySchema>;
export type RankingsResponse = z.infer<typeof RankingsResponseSchema>;
