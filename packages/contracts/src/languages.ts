import { z } from 'zod';

import { ContentLanguageSchema } from './content-bundle';
import { PoolKindSchema, TrackSchema } from './tracks';

/** A playable language. The slug is the key shared with content bundles and play requests. */
export const LanguageSchema = z.object({
  slug: ContentLanguageSchema,
  displayName: z.string().min(1),
  /** Which track the pool is on, and for a natural-language pool which kind of text (§13.1). */
  track: TrackSchema,
  kind: PoolKindSchema.nullable(),
});

/**
 * Body of `GET /api/languages`: the enabled languages the signed-in account may use, in display
 * order (§9.5, §13.11).
 */
export const LanguagesResponseSchema = z.object({
  languages: z.array(LanguageSchema),
});

export type Language = z.infer<typeof LanguageSchema>;
export type LanguagesResponse = z.infer<typeof LanguagesResponseSchema>;
