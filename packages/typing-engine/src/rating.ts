import { CPU_MAX_LEVEL, CPU_MIN_LEVEL } from './cpu';

/**
 * Rating from vs CPU results. Each language has its own Elo-style rating against CPUs of fixed
 * strength; the overall rating weighs the languages from best to worst, so several languages beat
 * one, and the ranks are laid over the overall rating's range.
 */

/**
 * How many languages the overall rating counts. Adding a language means raising this: the ceiling
 * of the overall rating and every rank threshold grow with it, and nobody's own rating changes
 * (a new language starts at 0, which adds nothing). A test keeps it equal to the language list.
 */
export const RATING_LANGUAGE_COUNT = 4;

/** Everyone starts at 0 in every language. */
export const RATING_INITIAL = 0;

/** A CPU's rating is this times its level, so level 100 is 2000 and level 1 is 20. */
export const RATING_PER_CPU_LEVEL = 20;

/** The most a language can be rated: that of the strongest CPU. */
export const RATING_LANGUAGE_MAX = RATING_PER_CPU_LEVEL * CPU_MAX_LEVEL;

/** Elo's scale: a gap of this many points is a 10-to-1 favourite. */
const ELO_SCALE = 400;
/** The step of an Elo update: larger while a language is new, so it settles quickly. */
const K_PROVISIONAL = 40;
const K_ESTABLISHED = 20;
/** How many matches in a language are provisional. */
export const RATING_PROVISIONAL_GAMES = 10;

/**
 * The overall rating counts the best language at this weight, the next at `RATIO` times it, and so
 * on. With 0.5, a player who has maxed out a single language is already at 1000.
 */
export const RATING_TOP_WEIGHT = 0.5;
export const RATING_WEIGHT_RATIO = 0.8;

/** The rating of the CPU at a level. */
export function cpuRating(level: number): number {
  if (!Number.isInteger(level) || level < CPU_MIN_LEVEL || level > CPU_MAX_LEVEL) {
    throw new RangeError(
      `A CPU level is an integer from ${String(CPU_MIN_LEVEL)} to ${String(CPU_MAX_LEVEL)}`,
    );
  }
  return RATING_PER_CPU_LEVEL * level;
}

export interface MatchRatingInput {
  /** The language rating going into the match. */
  readonly rating: number;
  /** Matches already counted in the language, before this one. */
  readonly gamesPlayed: number;
  readonly cpuLevel: number;
  readonly won: boolean;
}

/**
 * How many points a match moves a language's rating: whole points, never below 0 in total and
 * never above the language maximum. Beating a stronger CPU is worth more than beating a weaker
 * one, and once the rating reaches a CPU's own, that CPU is worth almost nothing.
 */
export function ratingDelta({ rating, gamesPlayed, cpuLevel, won }: MatchRatingInput): number {
  const expected = 1 / (1 + 10 ** ((cpuRating(cpuLevel) - rating) / ELO_SCALE));
  const k = gamesPlayed < RATING_PROVISIONAL_GAMES ? K_PROVISIONAL : K_ESTABLISHED;
  const delta = Math.round(k * ((won ? 1 : 0) - expected));
  // + 0 turns a rounded -0 into 0.
  return Math.min(Math.max(delta, -rating), Math.max(RATING_LANGUAGE_MAX - rating, 0)) + 0;
}

/** The weight of the language ranked `index` (0 is the best) among the player's languages. */
export function ratingWeight(index: number): number {
  return RATING_TOP_WEIGHT * RATING_WEIGHT_RATIO ** index;
}

/** The highest overall rating for a number of languages: every one of them maxed out. */
export function maxTotalRating(languageCount: number = RATING_LANGUAGE_COUNT): number {
  let weights = 0;
  for (let index = 0; index < languageCount; index += 1) weights += ratingWeight(index);
  return Math.round(RATING_LANGUAGE_MAX * weights);
}

/**
 * The overall rating: the language ratings from best to worst, each times its weight. Languages
 * not played are 0 and cost nothing, so they may be left out of `ratings`.
 */
export function totalRating(
  ratings: readonly number[],
  languageCount: number = RATING_LANGUAGE_COUNT,
): number {
  const best = [...ratings].sort((a, b) => b - a).slice(0, languageCount);
  return Math.round(best.reduce((sum, rating, index) => sum + rating * ratingWeight(index), 0));
}

export const RANK_TIERS = [
  'beginner',
  'bronze',
  'silver',
  'gold',
  'platinum',
  'diamond',
  'master',
] as const;
export type RankTier = (typeof RANK_TIERS)[number];

/** Divisions 1 to 5 within every tier but master; a bigger number is higher. */
export const RANK_DIVISIONS = 5;

/**
 * Where each tier starts and how wide one of its divisions is, measured against a ceiling of
 * 2000. The real thresholds are these scaled to the current ceiling, so the ranks always span the
 * whole range whatever the number of languages.
 */
const RANK_LAYOUT: readonly { tier: RankTier; start: number; width: number }[] = [
  { tier: 'beginner', start: 0, width: 40 },
  { tier: 'bronze', start: 200, width: 50 },
  { tier: 'silver', start: 450, width: 60 },
  { tier: 'gold', start: 750, width: 70 },
  { tier: 'platinum', start: 1100, width: 80 },
  { tier: 'diamond', start: 1500, width: 90 },
  { tier: 'master', start: 1950, width: 0 },
];
const RANK_LAYOUT_CEILING = 2000;

export interface Rank {
  readonly tier: RankTier;
  /** 1 to 5, or null for master, which has no divisions. */
  readonly division: number | null;
}

interface RankStep extends Rank {
  /** The lowest overall rating in this rank. */
  readonly min: number;
}

/** Every rank from the lowest, with the rating it starts at, for a number of languages. */
export function rankSteps(languageCount: number = RATING_LANGUAGE_COUNT): RankStep[] {
  const scale = maxTotalRating(languageCount) / RANK_LAYOUT_CEILING;
  const steps: RankStep[] = [];
  for (const { tier, start, width } of RANK_LAYOUT) {
    if (tier === 'master') {
      steps.push({ tier, division: null, min: Math.round(start * scale) });
      continue;
    }
    for (let division = 1; division <= RANK_DIVISIONS; division += 1) {
      steps.push({ tier, division, min: Math.round((start + (division - 1) * width) * scale) });
    }
  }
  return steps;
}

export interface RankStanding extends Rank {
  /** The rating this rank starts at. */
  readonly min: number;
  /** The rating of the next rank up, or null at master. */
  readonly next: Rank | null;
  readonly nextMin: number | null;
  /** How far through this rank the rating is, 0 to 1; 1 at master. */
  readonly progress: number;
}

/** The rank an overall rating holds, and how close it is to the next. */
export function rankOf(total: number, languageCount: number = RATING_LANGUAGE_COUNT): RankStanding {
  const steps = rankSteps(languageCount);
  let index = 0;
  steps.forEach((step, candidate) => {
    if (step.min <= total) index = candidate;
  });
  const current = steps[index];
  if (current === undefined) throw new Error('there is always a lowest rank');
  const next = steps[index + 1];
  return {
    tier: current.tier,
    division: current.division,
    min: current.min,
    next: next === undefined ? null : { tier: next.tier, division: next.division },
    nextMin: next?.min ?? null,
    progress:
      next === undefined ? 1 : Math.min((total - current.min) / (next.min - current.min), 1),
  };
}
