import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { HistoryRequest } from '@typing-trainer/contracts';
import type { DataSource } from 'typeorm';

import { periodCondition } from '../../common/period-sql';
import { returnedRows } from '../../database/returned-rows';

export interface HistoryRow {
  readonly id: string;
  readonly started_at: Date;
  readonly mode: string;
  readonly slug: string;
  readonly kpm: string;
  readonly accuracy: string;
  readonly score: number;
  readonly result: string | null;
}

export interface HistoryPage {
  readonly rows: HistoryRow[];
  readonly total: number;
}

@Injectable()
export class HistoryRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * A page of the user's own runs (§6.3), newest first, with the same optional period/mode/
   * language filters as the request. No index beyond the existing `user_id`-leading ones (§9.6):
   * filtering by `user_id` alone still uses a leading prefix of any of them, and sorting the
   * result by `started_at` is cheap in memory at the up-to-10,000-rows-per-user scale those
   * indexes were sized for.
   */
  async page(userId: string, request: HistoryRequest): Promise<HistoryPage> {
    const { period, mode, language } = request;
    const offset = (request.page - 1) * request.pageSize;

    const rows = await this.dataSource.query<HistoryRow[]>(
      `SELECT r.id, r.started_at, r.mode, l.slug, r.kpm, r.accuracy, r.score, r.result
       FROM play_sessions r
       JOIN users u ON u.id = r.user_id
       JOIN programming_languages l ON l.id = r.language_id
       WHERE r.user_id = $1
         AND ($2::text IS NULL OR r.mode = $2)
         AND ($3::text IS NULL OR l.slug = $3)
         AND ${periodCondition('$4')}
       ORDER BY r.started_at DESC, r.id DESC
       LIMIT $5 OFFSET $6`,
      [userId, mode ?? null, language ?? null, period ?? null, request.pageSize, offset],
    );

    const [{ count } = { count: '0' }] = await this.dataSource.query<{ count: string }[]>(
      `SELECT count(*)::text AS count
       FROM play_sessions r
       JOIN users u ON u.id = r.user_id
       JOIN programming_languages l ON l.id = r.language_id
       WHERE r.user_id = $1
         AND ($2::text IS NULL OR r.mode = $2)
         AND ($3::text IS NULL OR l.slug = $3)
         AND ${periodCondition('$4')}`,
      [userId, mode ?? null, language ?? null, period ?? null],
    );

    return { rows, total: Number(count) };
  }

  /**
   * Hard-deletes one run (Q18: no soft delete, no restore), but only for its owner — never lets
   * one user's request remove another user's row. Returns whether a row was actually deleted.
   */
  async delete(id: string, userId: string): Promise<boolean> {
    const result: unknown = await this.dataSource.query(
      `DELETE FROM play_sessions WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId],
    );
    return returnedRows<{ id: string }>(result).length > 0;
  }
}
