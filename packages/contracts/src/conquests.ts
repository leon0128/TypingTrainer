import { z } from 'zod';

import { ContentLanguageSchema } from './content-bundle';
import { CpuLevelSchema } from './play';

/** The number of levels a language can have beaten (§4.3.2). */
export const CPU_LEVEL_COUNT = 100;

/** What one language's conquest records say (§4.3.4). */
export const LanguageConquestSchema = z.object({
  language: ContentLanguageSchema,
  /** The highest level beaten, or null when none has been. */
  highestLevel: CpuLevelSchema.nullable(),
  /** Every level beaten, ascending; a level beaten many times appears once. */
  beatenLevels: z.array(CpuLevelSchema),
  /** How many distinct levels are beaten, which is `beatenLevels.length`. */
  totalConquests: z.int().min(0).max(CPU_LEVEL_COUNT),
});

/** Body of `GET /api/cpu-conquests`: every enabled language, in display order (§9.5). */
export const ConquestsResponseSchema = z.object({
  languages: z.array(LanguageConquestSchema),
});

export type LanguageConquest = z.infer<typeof LanguageConquestSchema>;
export type ConquestsResponse = z.infer<typeof ConquestsResponseSchema>;
