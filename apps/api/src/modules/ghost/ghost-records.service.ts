import { Inject, Injectable } from '@nestjs/common';
import {
  ContentLanguageSchema,
  type GhostRecordsResponse,
  type LanguageGhostRecords,
  type User,
} from '@typing-trainer/contracts';

import { GhostRecordsRepository } from './ghost-records.repository';

export type RecordsSource = Pick<GhostRecordsRepository, 'bestByLanguage'>;

@Injectable()
export class GhostRecordsService {
  constructor(@Inject(GhostRecordsRepository) private readonly records: RecordsSource) {}

  async get(user: User): Promise<GhostRecordsResponse> {
    const languages: LanguageGhostRecords[] = [];
    for (const row of await this.records.bestByLanguage(user.id)) {
      const slug = ContentLanguageSchema.safeParse(row.slug);
      if (!slug.success) continue;
      languages.push({
        language: slug.data,
        daily: row.daily,
        weekly: row.weekly,
        total: row.total,
      });
    }
    return { languages };
  }
}
