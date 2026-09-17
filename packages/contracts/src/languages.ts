import { z } from 'zod';

import { ContentLanguageSchema } from './content-bundle';

/** A playable language. The slug is the key shared with content bundles and play requests. */
export const LanguageSchema = z.object({
  slug: ContentLanguageSchema,
  displayName: z.string().min(1),
});

/** Body of `GET /api/languages`: enabled languages in display order (§9.5). */
export const LanguagesResponseSchema = z.object({
  languages: z.array(LanguageSchema),
});

export type Language = z.infer<typeof LanguageSchema>;
export type LanguagesResponse = z.infer<typeof LanguagesResponseSchema>;
