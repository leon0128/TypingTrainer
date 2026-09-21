import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

export interface BeatenLevelRow {
  readonly slug: string;
  readonly level: number;
}

/**
 * Conquest records are never stored (§4.3.4): a level is beaten in a language when the user has a
 * vs CPU run there with result `win` (a tie is stored as a win), so deleting the run deletes the
 * conquest with it. This class is the only place that says what a conquest is.
 */
@Injectable()
export class ConquestsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Each distinct (language, level) the user has beaten, in language then level order. */
  beatenLevels(userId: string): Promise<BeatenLevelRow[]> {
    return this.dataSource.query<BeatenLevelRow[]>(
      `SELECT l.slug, r.cpu_level::int AS level
       FROM play_sessions r JOIN languages l ON l.id = r.language_id
       WHERE r.user_id = $1 AND r.mode = 'cpu' AND r.result = 'win'
       GROUP BY l.slug, l.sort_order, r.cpu_level
       ORDER BY l.sort_order ASC, r.cpu_level ASC`,
      [userId],
    );
  }

  /** The highest level the user has beaten in any language, or null when none. */
  async highestLevel(userId: string): Promise<number | null> {
    const [row] = await this.dataSource.query<{ level: number | null }[]>(
      `SELECT max(cpu_level)::int AS level FROM play_sessions
       WHERE user_id = $1 AND mode = 'cpu' AND result = 'win'`,
      [userId],
    );
    return row?.level ?? null;
  }
}
