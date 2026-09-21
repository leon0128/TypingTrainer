import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ContentLanguageSchema,
  POOLS,
  poolAvailable,
  type Language,
  type LanguagesResponse,
  type User,
} from '@typing-trainer/contracts';

import { ContentLibrary } from '../content/content-library';
import { LanguagesRepository } from './languages.repository';

/** The part of the repository the service needs, so tests can substitute it. */
export type LanguageSource = Pick<LanguagesRepository, 'findEnabled'>;

/** The part of the content library the service needs. */
export type BundleSource = Pick<ContentLibrary, 'has'>;

@Injectable()
export class LanguagesService {
  private readonly logger = new Logger(LanguagesService.name);

  constructor(
    @Inject(LanguagesRepository) private readonly repository: LanguageSource,
    @Inject(ContentLibrary) private readonly content: BundleSource,
  ) {}

  /**
   * Enabled languages that can be played by this account: the contracts know them, a content bundle
   * is loaded, and the account's display language allows the track (§13.11).
   * Startup refuses a mismatch (ContentConsistency), but a language can be enabled while the API
   * runs, so such a row is left out and logged rather than failing the whole list.
   */
  async list(user: Pick<User, 'locale'>): Promise<LanguagesResponse> {
    const languages: Language[] = [];
    for (const row of await this.repository.findEnabled()) {
      const slug = ContentLanguageSchema.safeParse(row.slug);
      if (!slug.success) {
        this.logger.warn(`enabled language "${row.slug}" is not a content language; omitted`);
        continue;
      }
      if (!this.content.has(slug.data)) {
        this.logger.warn(`enabled language "${row.slug}" has no content bundle; omitted`);
        continue;
      }
      // What the account may not use is not listed at all (§13.11).
      if (!poolAvailable(slug.data, user.locale)) continue;
      languages.push({
        slug: slug.data,
        displayName: row.displayName,
        track: POOLS[slug.data].track,
        kind: POOLS[slug.data].kind,
      });
    }
    return { languages };
  }
}
