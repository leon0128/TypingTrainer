import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ContentLanguageSchema,
  type Language,
  type LanguagesResponse,
} from '@typing-trainer/contracts';

import { LanguagesRepository } from './languages.repository';

/** The part of the repository the service needs, so tests can substitute it. */
export type LanguageSource = Pick<LanguagesRepository, 'findEnabled'>;

@Injectable()
export class LanguagesService {
  private readonly logger = new Logger(LanguagesService.name);

  constructor(@Inject(LanguagesRepository) private readonly repository: LanguageSource) {}

  /**
   * Enabled languages that the contracts know. A row whose slug has no content language is left
   * out and logged rather than failing the whole list; the startup check that languages and
   * content bundles agree arrives with the play session API.
   */
  async list(): Promise<LanguagesResponse> {
    const languages: Language[] = [];
    for (const row of await this.repository.findEnabled()) {
      const slug = ContentLanguageSchema.safeParse(row.slug);
      if (!slug.success) {
        this.logger.warn(`enabled language "${row.slug}" is not a content language; omitted`);
        continue;
      }
      languages.push({ slug: slug.data, displayName: row.displayName });
    }
    return { languages };
  }
}
