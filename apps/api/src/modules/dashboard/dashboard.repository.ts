import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

export interface RunPointRow {
  readonly started_at: Date;
  readonly score: number;
}

export interface DayBestRow {
  readonly day: string;
  readonly score: number;
}

export interface SummaryRow {
  readonly total_runs: number;
  readonly total_keystrokes: number;
}

export interface LanguageBestRow {
  readonly slug: string;
  readonly score: number;
}

/**
 * Plain queries over `play_sessions` with nothing cached or denormalized between them and the
 * table, so deleting a run shows on the next request by construction (§6.3).
 */
@Injectable()
export class DashboardRepository {
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

  /** Every run whose local date is within the window, oldest first (the raw `daily` points). */
  runs(userId: string, languageId: number, from: string, to: string): Promise<RunPointRow[]> {
    return this.dataSource.query<RunPointRow[]>(
      `SELECT started_at, score FROM play_sessions
       WHERE user_id = $1 AND language_id = $2 AND local_date BETWEEN $3 AND $4
       ORDER BY started_at ASC, id ASC`,
      [userId, languageId, from, to],
    );
  }

  /** The best score of each day that has a run; either bound may be open. */
  bestPerDay(
    userId: string,
    languageId: number,
    from: string | null,
    to: string | null,
  ): Promise<DayBestRow[]> {
    return this.dataSource.query<DayBestRow[]>(
      `SELECT to_char(local_date, 'YYYY-MM-DD') AS day, max(score)::int AS score
       FROM play_sessions
       WHERE user_id = $1 AND language_id = $2
         AND ($3::date IS NULL OR local_date >= $3::date)
         AND ($4::date IS NULL OR local_date <= $4::date)
       GROUP BY local_date
       ORDER BY local_date ASC`,
      [userId, languageId, from, to],
    );
  }

  async totals(userId: string): Promise<SummaryRow> {
    const [row] = await this.dataSource.query<SummaryRow[]>(
      `SELECT count(*)::int AS total_runs,
              coalesce(sum(effective_keystrokes), 0)::int AS total_keystrokes
       FROM play_sessions WHERE user_id = $1`,
      [userId],
    );
    return row ?? { total_runs: 0, total_keystrokes: 0 };
  }

  bestPerLanguage(userId: string): Promise<LanguageBestRow[]> {
    return this.dataSource.query<LanguageBestRow[]>(
      `SELECT l.slug, max(r.score)::int AS score
       FROM play_sessions r JOIN languages l ON l.id = r.language_id
       WHERE r.user_id = $1
       GROUP BY l.slug, l.sort_order
       ORDER BY l.sort_order ASC`,
      [userId],
    );
  }
}
