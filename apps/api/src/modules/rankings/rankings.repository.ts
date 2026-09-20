import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { RankingPeriod } from '@typing-trainer/contracts';
import type { DataSource } from 'typeorm';

import { periodCondition } from '../../common/period-sql';

export interface RankingRow {
  readonly id: string;
  readonly mode: string;
  readonly started_at: Date;
  readonly score: number;
  readonly kpm: string;
  readonly accuracy: string;
}

@Injectable()
export class RankingsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * The user's own top 10 runs for a language, within the period (§6.1). "Today" and "this week"
   * are read from the database clock and the player's profile time zone in the same statement, so
   * the ranking always matches what `local_date`/`local_week_start` would be computed as right
   * now — it is not the value stored on any particular run, and it moves the moment local
   * midnight passes, independently of when the runs themselves were saved (§6.4).
   *
   * Ties break by the earlier run (§6.1); `id` is a last-resort tiebreaker so paging, if ever
   * added, is stable.
   */
  async top10(userId: string, languageId: number, period: RankingPeriod): Promise<RankingRow[]> {
    return this.dataSource.query<RankingRow[]>(
      `SELECT r.id, r.mode, r.started_at, r.score, r.kpm, r.accuracy
       FROM play_sessions r
       JOIN users u ON u.id = r.user_id
       WHERE r.user_id = $1 AND r.language_id = $2
         AND ${periodCondition('$3')}
       ORDER BY r.score DESC, r.started_at ASC, r.id ASC
       LIMIT 10`,
      [userId, languageId, period],
    );
  }
}
