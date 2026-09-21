import {
  TRACKS,
  poolKindOf,
  type ContentLanguage,
  type Language,
  type Track,
} from '@typing-trainer/contracts';
import type { TFunction } from 'i18next';

/** How each track is written in a URL (§13.9). */
export const TRACK_SEGMENTS = {
  code: 'code',
  'natural-ja': 'ja',
  'natural-en': 'en',
} as const satisfies Record<Track, string>;

/** The track a URL segment names, or null when it names none. */
export function trackOfSegment(segment: string | undefined): Track | null {
  return TRACKS.find((track) => TRACK_SEGMENTS[track] === segment) ?? null;
}

/** The path of a track's screen: its start screen, or one of the screens under it. */
export function trackPath(track: Track, screen = ''): string {
  return `/${TRACK_SEGMENTS[track]}${screen === '' ? '' : `/${screen}`}`;
}

/**
 * What a pool is called on screen: a programming language by its name, and a natural-language pool
 * by the kind of text, since the track already says which language it is (§13.9).
 */
export function languageLabel(t: TFunction, slug: ContentLanguage, displayName: string): string {
  const kind = poolKindOf(slug);
  return kind === null ? displayName : t(`poolKinds.${kind}`);
}

export const poolName = (t: TFunction, language: Language): string =>
  languageLabel(t, language.slug, language.displayName);
