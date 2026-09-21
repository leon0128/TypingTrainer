import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type {
  RankingEntry,
  RankingsRequest,
  RankingsResponse,
  User,
} from '@typing-trainer/contracts';

import { assertPoolAvailable } from '../../common/pool-access';
import { LanguagesRepository } from '../languages/languages.repository';
import { RankingsRepository, type RankingRow } from './rankings.repository';

/** The part of the repository the service needs, so tests can substitute it. */
export type RankingSource = Pick<RankingsRepository, 'top10'>;

/** The part of the languages repository the service needs. */
export type LanguageIdSource = Pick<LanguagesRepository, 'findEnabled'>;

@Injectable()
export class RankingsService {
  constructor(
    @Inject(RankingsRepository) private readonly rankings: RankingSource,
    @Inject(LanguagesRepository) private readonly languages: LanguageIdSource,
  ) {}

  async get(user: User, request: RankingsRequest): Promise<RankingsResponse> {
    const language = (await this.languages.findEnabled()).find(
      (row) => row.slug === request.language,
    );
    if (language === undefined) {
      throw new BadRequestException(`language "${request.language}" is not available`);
    }
    assertPoolAvailable(user, request.language);

    const rows = await this.rankings.top10(user.id, language.id, request.period);
    return {
      period: request.period,
      language: request.language,
      entries: rows.map(toEntry),
    };
  }
}

function toEntry(row: RankingRow): RankingEntry {
  return {
    id: row.id,
    mode: row.mode as RankingEntry['mode'],
    startedAt: row.started_at.toISOString(),
    score: row.score,
    kpm: Number(row.kpm),
    accuracy: Number(row.accuracy),
  };
}
