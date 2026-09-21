import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

export interface LanguageRatingRow {
  readonly slug: string;
  readonly displayName: string;
  readonly rating: number;
  readonly gamesPlayed: number;
}

@Injectable()
export class RatingsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Every enabled language on the given tracks in display order; a language the user has not
   * played rates 0.
   */
  list(userId: string, tracks: readonly string[]): Promise<LanguageRatingRow[]> {
    return this.dataSource.query<LanguageRatingRow[]>(
      `SELECT l.slug, l.display_name AS "displayName", COALESCE(r.rating, 0)::int AS rating,
              COALESCE(r.games_played, 0)::int AS "gamesPlayed"
       FROM languages l
       LEFT JOIN language_ratings r ON r.language_id = l.id AND r.user_id = $1
       WHERE l.enabled = true AND l.track = ANY($2::text[])
       ORDER BY l.sort_order ASC, l.id ASC`,
      [userId, [...tracks]],
    );
  }
}
