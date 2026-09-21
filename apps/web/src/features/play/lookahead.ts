import { poolKindOf, type ContentLanguage } from '@typing-trainer/contracts';

/** How many blocks after the current one are shown: three short ones, one long one (§13.6). */
export function lookahead(language: ContentLanguage): number {
  return poolKindOf(language) === 'word' || poolKindOf(language) === 'line' ? 3 : 1;
}
