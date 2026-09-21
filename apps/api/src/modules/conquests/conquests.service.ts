import { Inject, Injectable } from '@nestjs/common';
import {
  ContentLanguageSchema,
  poolAvailable,
  type ConquestsResponse,
  type LanguageConquest,
  type User,
} from '@typing-trainer/contracts';

import { accountTracks } from '../../common/pool-access';
import { LanguagesRepository } from '../languages/languages.repository';
import { ConquestsRepository } from './conquests.repository';

export type ConquestSource = Pick<ConquestsRepository, 'beatenLevels'>;
export type LanguageListSource = Pick<LanguagesRepository, 'findEnabled'>;

@Injectable()
export class ConquestsService {
  constructor(
    @Inject(ConquestsRepository) private readonly conquests: ConquestSource,
    @Inject(LanguagesRepository) private readonly languages: LanguageListSource,
  ) {}

  /**
   * Conquest state of every enabled language the account may use, including the ones with nothing
   * beaten (§4.3.4, §13.11).
   */
  async get(user: User): Promise<ConquestsResponse> {
    const beaten = new Map<string, number[]>();
    for (const row of await this.conquests.beatenLevels(user.id, accountTracks(user))) {
      beaten.set(row.slug, [...(beaten.get(row.slug) ?? []), row.level]);
    }

    const languages: LanguageConquest[] = [];
    for (const row of await this.languages.findEnabled()) {
      const slug = ContentLanguageSchema.safeParse(row.slug);
      if (!slug.success || !poolAvailable(slug.data, user.locale)) continue;
      const levels = beaten.get(row.slug) ?? [];
      languages.push({
        language: slug.data,
        highestLevel: levels[levels.length - 1] ?? null,
        beatenLevels: levels,
        totalConquests: levels.length,
      });
    }
    return { languages };
  }
}
