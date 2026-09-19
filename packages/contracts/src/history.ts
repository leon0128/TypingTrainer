import { z } from 'zod';

import { ContentLanguageSchema } from './content-bundle';
import { PlayModeSchema } from './play';
import { RankingPeriodSchema } from './rankings';

export const HISTORY_MAX_PAGE_SIZE = 50;
export const HISTORY_DEFAULT_PAGE_SIZE = 20;

/** Query of `GET /api/history` (§9.5, §6.3): every filter is optional. */
export const HistoryRequestSchema = z.object({
  period: RankingPeriodSchema.optional(),
  mode: PlayModeSchema.optional(),
  language: ContentLanguageSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(HISTORY_MAX_PAGE_SIZE)
    .default(HISTORY_DEFAULT_PAGE_SIZE),
});

/** One row of the history list (§6.3): timestamp, mode, language, KPM, accuracy, score, result. */
export const HistoryEntrySchema = z.object({
  id: z.uuid(),
  startedAt: z.iso.datetime(),
  mode: PlayModeSchema,
  language: ContentLanguageSchema,
  kpm: z.number().nonnegative(),
  accuracy: z.number().min(0).max(1),
  score: z.int().nonnegative(),
  /** Single play has no opponent, so no result; a tie is stored as a win (Q16). */
  result: z.enum(['win', 'lose']).nullable(),
});

export const HistoryResponseSchema = z.object({
  entries: z.array(HistoryEntrySchema),
  page: z.int().positive(),
  pageSize: z.int().positive(),
  total: z.int().nonnegative(),
});

export type HistoryRequest = z.output<typeof HistoryRequestSchema>;
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;
