import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { GhostPeriod } from '@typing-trainer/contracts';
import type { DataSource } from 'typeorm';

import { periodCondition } from '../../common/period-sql';

export interface LanguageRecordsRow {
  readonly slug: string;
  readonly daily: number | null;
  readonly weekly: number | null;
  readonly total: number | null;
}

/**
 * The player's own best scores, from every mode of a language (§6.1): a Ghost reproduces the record
 * the ranking shows at the top of the same period, and a run that beat it becomes the next record.
 * Periods come from the one definition rankings and history use.
 */
@Injectable()
export class GhostRecordsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** The best score of the user in one language and period, or null when there is no run. */
  async best(userId: string, languageId: number, period: GhostPeriod): Promise<number | null> {
    const [row] = await this.dataSource.query<{ score: number | null }[]>(
      `SELECT max(r.score)::int AS score
       FROM play_sessions r
       JOIN users u ON u.id = r.user_id
       WHERE r.user_id = $1 AND r.language_id = $2
         AND ${periodCondition('$3')}`,
      [userId, languageId, period],
    );
    return row?.score ?? null;
  }

  /** The best score in each period for every enabled language, in display order. */
  bestByLanguage(userId: string): Promise<LanguageRecordsRow[]> {
    return this.dataSource.query<LanguageRecordsRow[]>(
      `SELECT l.slug,
              max(r.score) FILTER (WHERE ${periodCondition("'daily'")})::int AS daily,
              max(r.score) FILTER (WHERE ${periodCondition("'weekly'")})::int AS weekly,
              max(r.score)::int AS total
       FROM languages l
       JOIN users u ON u.id = $1
       LEFT JOIN play_sessions r ON r.language_id = l.id AND r.user_id = u.id
       WHERE l.enabled
       GROUP BY l.slug, l.sort_order, u.timezone
       ORDER BY l.sort_order ASC`,
      [userId],
    );
  }
}
