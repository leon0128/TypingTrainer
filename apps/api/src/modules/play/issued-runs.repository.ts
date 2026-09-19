import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { ContentLanguage } from '@typing-trainer/contracts';
import type { DataSource } from 'typeorm';

import { returnedRows } from '../../database/returned-rows';
import { ISSUED_RUN_RETENTION } from './play.constants';

export interface IssuedRunRow {
  readonly id: string;
  readonly issuedAt: Date;
}

/** An issued run marked as submitted, with everything needed to judge the result. */
export interface ConsumedRun {
  readonly id: string;
  readonly languageId: number;
  readonly language: ContentLanguage;
  readonly mode: string;
  readonly seed: string;
  readonly contentRevision: string;
  readonly blockIds: string[];
  readonly issuedAt: Date;
  readonly submittedAt: Date;
  /** Milliseconds from issuing to this submission, on the database clock. */
  readonly wallElapsedMs: number;
}

/** The columns consume() returns. */
interface ConsumedRunColumns {
  id: string;
  language_id: number;
  language: ContentLanguage;
  mode: string;
  rng_seed: string;
  content_revision: string;
  block_ids: string[];
  issued_at: Date;
  submitted_at: Date;
  wall_elapsed_ms: string;
}

/** Why a run could not be consumed, when the conditional update matched no row. */
export type ConsumeFailure = 'missing' | 'submitted' | 'expired';

export interface StoredRun {
  readonly id: string;
  readonly startedAt: Date;
  readonly localDate: string;
}

export interface RunToStore {
  readonly userId: string;
  readonly languageId: number;
  readonly mode: string;
  readonly durationSec: number;
  readonly issuedAt: Date;
  readonly submittedAt: Date;
  /** Run time of the submitted log, in milliseconds, used to date the run back from submission. */
  readonly runTimeMs: number;
  readonly rawKeystrokes: number;
  readonly effectiveKeystrokes: number;
  readonly missCount: number;
  readonly kpm: number;
  readonly accuracy: number;
  readonly score: number;
  readonly rngSeed: string;
  readonly contentRevision: string;
  readonly appVersion: string;
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
    const result: unknown = await this.dataSource.query(
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
    const row = returnedRows<{ id: string; issued_at: Date }>(result)[0];
    if (row === undefined) throw new Error('inserting an issued run returned no row');
    return { id: row.id, issuedAt: row.issued_at };
  }

  /**
   * Marks the run submitted and returns it, but only for its owner, only once, and only inside the
   * submission window — all judged on the database clock in one statement (§9.8). A result that
   * then fails validation cannot be retried with a different log.
   */
  async consume(id: string, userId: string, windowMs: number): Promise<ConsumedRun | undefined> {
    const result: unknown = await this.dataSource.query(
      `UPDATE issued_runs r SET submitted_at = now()
       FROM programming_languages l
       WHERE r.id = $1 AND r.user_id = $2 AND r.submitted_at IS NULL
         AND r.issued_at > now() - make_interval(secs => $3)
         AND l.id = r.language_id
       RETURNING r.id, r.language_id, l.slug AS language, r.mode, r.rng_seed, r.content_revision,
                 r.block_ids, r.issued_at, r.submitted_at,
                 round(extract(epoch FROM now() - r.issued_at) * 1000) AS wall_elapsed_ms`,
      [id, userId, windowMs / 1000],
    );
    const row = returnedRows<ConsumedRunColumns>(result)[0];
    return row === undefined
      ? undefined
      : {
          id: row.id,
          languageId: row.language_id,
          language: row.language,
          mode: row.mode,
          seed: row.rng_seed,
          contentRevision: row.content_revision,
          blockIds: row.block_ids,
          issuedAt: row.issued_at,
          submittedAt: row.submitted_at,
          wallElapsedMs: Number(row.wall_elapsed_ms),
        };
  }

  /** Why consume() matched no row: unknown or another user's run, already submitted, or expired. */
  async consumeFailure(id: string, userId: string): Promise<ConsumeFailure> {
    const rows = await this.dataSource.query<{ submitted: boolean }[]>(
      `SELECT submitted_at IS NOT NULL AS submitted
       FROM issued_runs WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    const row = rows[0];
    if (row === undefined) return 'missing';
    return row.submitted ? 'submitted' : 'expired';
  }

  /**
   * Stores the run (§9.3). `started_at` is the submission time minus the run time, never before the
   * run was issued, and the local date and week start are computed here from the player's profile
   * time zone, so day boundaries never depend on the application's clock or locale (§6.4).
   */
  async storeRun(run: RunToStore): Promise<StoredRun> {
    const result: unknown = await this.dataSource.query(
      `WITH run AS (
         SELECT u.id AS user_id, u.timezone,
                GREATEST($5::timestamptz, $6::timestamptz - make_interval(secs => $7)) AS started_at
         FROM users u WHERE u.id = $1
       )
       INSERT INTO play_sessions (
         user_id, mode, language_id, duration_sec, started_at, timezone, local_date,
         local_week_start, raw_keystrokes, effective_keystrokes, miss_count, kpm, accuracy, score,
         rng_seed, content_revision, app_version)
       SELECT run.user_id, $2, $3, $4, run.started_at, run.timezone,
              (run.started_at AT TIME ZONE run.timezone)::date,
              (run.started_at AT TIME ZONE run.timezone)::date
                - EXTRACT(DOW FROM run.started_at AT TIME ZONE run.timezone)::int,
              $8, $9, $10, $11, $12, $13, $14, $15, $16
       FROM run
       -- local_date as text: the driver would turn a date into a Date at the server's midnight.
       RETURNING id, started_at, local_date::text AS local_date`,
      [
        run.userId,
        run.mode,
        run.languageId,
        run.durationSec,
        run.issuedAt,
        run.submittedAt,
        run.runTimeMs / 1000,
        run.rawKeystrokes,
        run.effectiveKeystrokes,
        run.missCount,
        run.kpm,
        run.accuracy,
        run.score,
        run.rngSeed,
        run.contentRevision,
        run.appVersion,
      ],
    );
    const row = returnedRows<{ id: string; started_at: Date; local_date: string }>(result)[0];
    if (row === undefined) throw new Error('storing a play session returned no row');
    return { id: row.id, startedAt: row.started_at, localDate: row.local_date };
  }

  /** Deletes runs older than the retention window; returns how many were deleted. */
  async deleteStale(): Promise<number> {
    const result: unknown = await this.dataSource.query(
      `DELETE FROM issued_runs WHERE issued_at <= now() - $1::interval RETURNING id`,
      [ISSUED_RUN_RETENTION],
    );
    return returnedRows<{ id: string }>(result).length;
  }
}
