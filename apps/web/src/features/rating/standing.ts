import { trackOf, type LanguageRating, type Track } from '@typing-trainer/contracts';
import {
  RANK_TIERS,
  RATING_LANGUAGE_COUNTS,
  rankOf,
  totalRating,
  type Rank,
  type RankStanding,
} from '@typing-trainer/typing-engine';
import type { TFunction } from 'i18next';

/** The overall rating and the rank it holds. */
export interface Standing {
  readonly total: number;
  readonly rank: RankStanding;
}

/**
 * Worked out here from the language ratings rather than fetched: the server keeps no overall
 * rating, and both sides use the same functions. Only the track's own languages count, so another
 * track's ratings in the list never leak into it (§13.3).
 */
export function standingOf(languages: readonly LanguageRating[], track: Track): Standing {
  const count = RATING_LANGUAGE_COUNTS[track];
  const total = totalRating(
    languages.filter((entry) => trackOf(entry.language) === track).map((entry) => entry.rating),
    count,
  );
  return { total, rank: rankOf(total, count) };
}

/** The standing with one language's rating swapped for another, for "before" and "after". */
export function standingWith(
  languages: readonly LanguageRating[],
  language: LanguageRating['language'],
  rating: number,
): Standing {
  return standingOf(
    languages.map((entry) => (entry.language === language ? { ...entry, rating } : entry)),
    trackOf(language),
  );
}

/** "Gold 3", or "Master": tiers are named by the locale, divisions are numbers. */
export function rankName(t: TFunction, rank: Rank): string {
  const tier = t(`rating.tier.${rank.tier}`);
  return rank.division === null ? tier : t('rating.rank', { tier, division: rank.division });
}

/** The two looks of a rank's icon: one for light themes and one for dark, under `public/ranks`. */
export const ICON_THEMES = ['light', 'dark'] as const;
export type IconTheme = (typeof ICON_THEMES)[number];

/** Where a rank's icon lives for a theme. */
export function rankIconSrc(rank: Rank, theme: IconTheme): string {
  const name =
    rank.division === null ? `rank-${rank.tier}` : `rank-${rank.tier}-${String(rank.division)}`;
  return `/ranks/${theme}/${name}.svg`;
}

/** 1 when `after` is a higher rank than `before`, -1 when lower, 0 when the same. */
export function rankShift(before: Rank, after: Rank): number {
  const position = (rank: Rank) => RANK_TIERS.indexOf(rank.tier) * 10 + (rank.division ?? 0);
  return Math.sign(position(after) - position(before));
}
