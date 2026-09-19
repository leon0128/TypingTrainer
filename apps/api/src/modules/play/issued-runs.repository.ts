import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';

import { ISSUED_RUN_RETENTION } from './play.constants';

export interface IssuedRunRow {
  readonly id: string;
  readonly issuedAt: Date;
}

@Injectable()
export class IssuedRunsRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** The id of an enabled language, or undefined when it is unknown or disabled. */
  async findEnabledLanguageId(slug: string): Promise<number | undefined> {
    const rows = await this.dataSource.query<{ id: number }[]>(
      'SELECT id FROM programming_languages WHERE slug = $1 AND enabled = true',
      [slug],
    );
    return rows[0]?.id;
  }

  /** Records what was issued, on the database clock. */
  async create(run: {
    userId: string;
    languageId: number;
    mode: string;
    seed: bigint;
    contentRevision: string;
    blockIds: readonly string[];
  }): Promise<IssuedRunRow> {
    const rows = await this.dataSource.query<{ id: string; issued_at: Date }[]>(
      `INSERT INTO issued_runs (user_id, language_id, mode, rng_seed, content_revision, block_ids)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, issued_at`,
      [
        run.userId,
        run.languageId,
        run.mode,
        run.seed.toString(),
        run.contentRevision,
        [...run.blockIds],
      ],
    );
    const row = rows[0];
    if (row === undefined) throw new Error('inserting an issued run returned no row');
    return { id: row.id, issuedAt: row.issued_at };
  }

  /** Deletes runs older than the retention window; returns how many were deleted. */
  async deleteStale(): Promise<number> {
    const rows = await this.dataSource.query<{ id: string }[]>(
      `DELETE FROM issued_runs WHERE issued_at <= now() - $1::interval RETURNING id`,
      [ISSUED_RUN_RETENTION],
    );
    return rows.length;
  }
}
