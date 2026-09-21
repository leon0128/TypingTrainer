import { ForbiddenException } from '@nestjs/common';
import {
  availableTracks,
  poolAvailable,
  type ContentLanguage,
  type Track,
  type User,
} from '@typing-trainer/contracts';

/** The tracks an account may use (§13.11), for the queries that list or add up its play. */
export const accountTracks = (user: Pick<User, 'locale'>): Track[] => availableTracks(user.locale);

/**
 * Refuses a pool the account may not use with 403 (§13.11): Japanese for an account whose display
 * language is not Japanese. Every request that names a pool calls this, after the pool is known to
 * exist and be enabled, so the server never depends on the web to hide it.
 */
export function assertPoolAvailable(user: Pick<User, 'locale'>, language: ContentLanguage): void {
  if (!poolAvailable(language, user.locale)) {
    throw new ForbiddenException(`language "${language}" is not available for this account`);
  }
}

/** The same refusal for a track named directly (§13.11), such as the history's `track` filter. */
export function assertTrackAvailable(user: Pick<User, 'locale'>, track: Track): void {
  if (!availableTracks(user.locale).includes(track)) {
    throw new ForbiddenException(`track "${track}" is not available for this account`);
  }
}
