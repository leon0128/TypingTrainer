import { z } from 'zod';

import { ContentLanguageSchema } from './content-bundle';

/** One language's rating (§4.3.5): 0 until the player has raced a CPU in it. */
export const LanguageRatingSchema = z.object({
  language: ContentLanguageSchema,
  displayName: z.string().min(1),
  rating: z.int().nonnegative(),
  /** vs CPU matches counted in the rating; 0 means the language is unplayed. */
  gamesPlayed: z.int().nonnegative(),
});

/**
 * Body of `GET /api/ratings`: every enabled language, in display order (§9.5). The overall rating
 * and the rank are worked out from these by the shared rating functions, not stored.
 */
export const RatingsResponseSchema = z.object({
  languages: z.array(LanguageRatingSchema),
});

/** What a vs CPU match did to the player's rating, given with the stored run (§4.3.5). */
export const MatchRatingSchema = z.object({
  language: ContentLanguageSchema,
  /** The language's rating going into the match, and after it. */
  before: z.int().nonnegative(),
  after: z.int().nonnegative(),
  /** Every language's rating after the match, for the overall rating and rank. */
  languages: z.array(LanguageRatingSchema),
});

export type LanguageRating = z.infer<typeof LanguageRatingSchema>;
export type RatingsResponse = z.infer<typeof RatingsResponseSchema>;
export type MatchRating = z.infer<typeof MatchRatingSchema>;
