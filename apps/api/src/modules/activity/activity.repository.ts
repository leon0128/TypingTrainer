import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

export interface ActivityRow {
  readonly date: string;
  readonly code: number;
  readonly natural: number;
}

/**
 * Plain queries over `play_sessions` with nothing cached or denormalized (§6.3): a run deleted from
 * the history is gone from the next reading of the grid.
 */
@Injectable()
export class ActivityRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Today's date in the player's profile time zone, from the database clock (§6.4). */
  async today(userId: string): Promise<string> {
    const [row] = await this.dataSource.query<{ today: string }[]>(
      `SELECT to_char((now() AT TIME ZONE timezone)::date, 'YYYY-MM-DD') AS today
       FROM users WHERE id = $1`,
      [userId],
    );
    if (row === undefined) throw new Error('user not found');
    return row.today;
  }

  /**
   * The user's own runs added up by local date, oldest first, inclusive of both ends: the runs in
   * the programming languages, and those in the natural-language pools of either language. It
   * counts every pool, whatever the account's display language: it says that a run happened, and
   * names no pool (§13.11).
   */
  days(userId: string, from: string, to: string): Promise<ActivityRow[]> {
    return this.dataSource.query<ActivityRow[]>(
      `SELECT to_char(r.local_date, 'YYYY-MM-DD') AS date,
              (count(*) FILTER (WHERE l.track = 'code'))::int AS code,
              (count(*) FILTER (WHERE l.track <> 'code'))::int AS natural
       FROM play_sessions r JOIN languages l ON l.id = r.language_id
       WHERE r.user_id = $1 AND r.local_date BETWEEN $2::date AND $3::date
       GROUP BY r.local_date
       ORDER BY r.local_date ASC`,
      [userId, from, to],
    );
  }
}
