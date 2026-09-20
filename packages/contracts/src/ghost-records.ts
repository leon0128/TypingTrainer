import { z } from 'zod';

import { ContentLanguageSchema } from './content-bundle';

/** The player's best score in each period for one language, or null where there is no record. */
export const LanguageGhostRecordsSchema = z.object({
  language: ContentLanguageSchema,
  daily: z.int().nonnegative().nullable(),
  weekly: z.int().nonnegative().nullable(),
  total: z.int().nonnegative().nullable(),
});

/**
 * Body of `GET /api/ghost-records`: every enabled language, in display order. It shows which Ghost
 * options can be chosen (§4.4); the server takes the record itself when a run is issued.
 */
export const GhostRecordsResponseSchema = z.object({
  languages: z.array(LanguageGhostRecordsSchema),
});

export type LanguageGhostRecords = z.infer<typeof LanguageGhostRecordsSchema>;
export type GhostRecordsResponse = z.infer<typeof GhostRecordsResponseSchema>;
