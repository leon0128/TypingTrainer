import type { LanguageRating } from '@typing-trainer/contracts';
import {
  RANK_TIERS,
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
 * rating, and both sides use the same functions.
 */
export function standingOf(languages: readonly LanguageRating[]): Standing {
  const total = totalRating(languages.map((entry) => entry.rating));
  return { total, rank: rankOf(total) };
}

/** The standing with one language's rating swapped for another, for "before" and "after". */
export function standingWith(
  languages: readonly LanguageRating[],
  language: LanguageRating['language'],
  rating: number,
): Standing {
  return standingOf(
    languages.map((entry) => (entry.language === language ? { ...entry, rating } : entry)),
  );
}

/** "Gold 3", or "Master": tiers are named by the locale, divisions are numbers. */
export function rankName(t: TFunction, rank: Rank): string {
  const tier = t(`rating.tier.${rank.tier}`);
  return rank.division === null ? tier : t('rating.rank', { tier, division: rank.division });
}

/** Where the placeholder (and later the real) icon of a rank lives, under `public/ranks`. */
export function rankIconSrc(rank: Rank): string {
  return rank.division === null
    ? `/ranks/rank-${rank.tier}.svg`
    : `/ranks/rank-${rank.tier}-${String(rank.division)}.svg`;
}

/** 1 when `after` is a higher rank than `before`, -1 when lower, 0 when the same. */
export function rankShift(before: Rank, after: Rank): number {
  const position = (rank: Rank) => RANK_TIERS.indexOf(rank.tier) * 10 + (rank.division ?? 0);
  return Math.sign(position(after) - position(before));
}
