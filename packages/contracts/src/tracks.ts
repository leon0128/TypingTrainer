import { z } from 'zod';

import type { ContentLanguage } from './content-bundle';

/**
 * The three things a player practises (§13.1). Each has its own rating, rank, and play-screen
 * settings.
 */
export const TRACKS = ['code', 'natural-ja', 'natural-en'] as const;
export const TrackSchema = z.enum(TRACKS);
export type Track = z.infer<typeof TrackSchema>;

/** The kinds of natural-language pool: one word, one sentence on a line, or several lines. */
export const POOL_KINDS = ['word', 'line', 'paragraph'] as const;
export const PoolKindSchema = z.enum(POOL_KINDS);
export type PoolKind = z.infer<typeof PoolKindSchema>;

export interface PoolInfo {
  readonly track: Track;
  /** Null for the programming languages of the code track. */
  readonly kind: PoolKind | null;
}

/**
 * The track and kind of every pool. It is exhaustive over `ContentLanguage`, so adding a pool
 * without saying where it belongs does not compile. The `languages` table repeats it (`track`,
 * `kind`), and the API refuses to start when the two disagree.
 */
export const POOLS: Readonly<Record<ContentLanguage, PoolInfo>> = {
  typescript: { track: 'code', kind: null },
  go: { track: 'code', kind: null },
  java: { track: 'code', kind: null },
  python: { track: 'code', kind: null },
  'ja-word': { track: 'natural-ja', kind: 'word' },
  'ja-line': { track: 'natural-ja', kind: 'line' },
  'ja-paragraph': { track: 'natural-ja', kind: 'paragraph' },
  'en-word': { track: 'natural-en', kind: 'word' },
  'en-line': { track: 'natural-en', kind: 'line' },
  'en-paragraph': { track: 'natural-en', kind: 'paragraph' },
};

/** The pools of each track, in the order of `CONTENT_LANGUAGES`. */
export const TRACK_POOLS: Readonly<Record<Track, readonly ContentLanguage[]>> = {
  code: poolsOf('code'),
  'natural-ja': poolsOf('natural-ja'),
  'natural-en': poolsOf('natural-en'),
};

function poolsOf(track: Track): ContentLanguage[] {
  return (Object.keys(POOLS) as ContentLanguage[]).filter((pool) => POOLS[pool].track === track);
}

export function trackOf(language: ContentLanguage): Track {
  return POOLS[language].track;
}

export function poolKindOf(language: ContentLanguage): PoolKind | null {
  return POOLS[language].kind;
}
