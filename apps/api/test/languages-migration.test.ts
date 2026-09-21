import { QueryFailedError } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

const FOREIGN_KEY_VIOLATION = '23503';

/**
 * The migration that renames `programming_languages` to `languages` and adds tracks (§13.2) must
 * keep every run, issued run, and rating that already points at a language. The database is
 * migrated, rolled back one step to the old schema, filled, and migrated again.
 */
describe.runIf(TEST_DATABASE_URL !== undefined)(
  'renaming languages and adding tracks (TEST_DATABASE_URL)',
  () => {
    let database: TestDatabase;
    const query = <T>(sql: string, parameters: unknown[] = []) =>
      database.dataSource.query<T>(sql, parameters);
    const tables = async () =>
      (
        await query<{ table_name: string }[]>(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
        )
      ).map((row) => row.table_name);

    beforeAll(async () => {
      database = await createTestDatabase(TEST_DATABASE_URL ?? '');
    });

    afterAll(async () => {
      await database.drop();
    });

    const blockCheck = async () =>
      (
        await query<{ definition: string }[]>(
          `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
           WHERE conname = 'chk_issued_runs_blocks'`,
        )
      )[0]?.definition ?? '';

    it('rolls back the block count check, and then to the old table without the tracks', async () => {
      // The newest migrations are the play look and the enabling of the pools, which have tests of
      // their own.
      await database.dataSource.undoLastMigration();
      await database.dataSource.undoLastMigration();
      expect(await blockCheck()).toMatch(/>= 1\).*<= 300/);
      await database.dataSource.undoLastMigration();
      expect(await blockCheck()).toContain('= 20');
      await database.dataSource.undoLastMigration();
      expect(await tables()).toContain('programming_languages');
      expect(await tables()).not.toContain('languages');
      const rows = await query<{ slug: string }[]>(
        'SELECT slug FROM programming_languages ORDER BY id',
      );
      expect(rows.map((row) => row.slug)).toEqual(['typescript', 'go', 'java', 'python']);
    });

    it('keeps runs, issued runs, and ratings across the migration, with their references', async () => {
      const [user] = await query<{ id: string }[]>(
        `INSERT INTO users (username, password_hash) VALUES ('Alice', 'hash') RETURNING id`,
      );
      const userId = user?.id ?? '';
      await query(
        `INSERT INTO play_sessions (user_id, mode, language_id, started_at, timezone, local_date,
           local_week_start, raw_keystrokes, effective_keystrokes, miss_count, kpm, accuracy,
           score, rng_seed, content_revision, app_version)
         VALUES ($1, 'single', 4, '2026-09-15T01:00:00Z', 'Asia/Tokyo', '2026-09-15', '2026-09-13',
           420, 400, 20, 200, 0.9524, 190, 42, 'abc', '0.0.0')`,
        [userId],
      );
      await query(
        `INSERT INTO issued_runs (user_id, language_id, mode, rng_seed, content_revision, block_ids)
         VALUES ($1, 2, 'single', 7, 'abc', $2)`,
        [userId, Array.from({ length: 20 }, (_, index) => `go/block-${String(index)}`)],
      );
      await query(
        `INSERT INTO language_ratings (user_id, language_id, rating, games_played)
         VALUES ($1, 3, 640, 12)`,
        [userId],
      );

      await database.dataSource.runMigrations();
      expect(await blockCheck()).toMatch(/>= 1\).*<= 300/);

      expect(await tables()).toContain('languages');
      expect(await tables()).not.toContain('programming_languages');
      const [run] = await query<{ slug: string; track: string; kind: string | null }[]>(
        `SELECT l.slug, l.track, l.kind FROM play_sessions r JOIN languages l ON l.id = r.language_id`,
      );
      expect(run).toEqual({ slug: 'python', track: 'code', kind: null });
      const [issued] = await query<{ slug: string }[]>(
        `SELECT l.slug FROM issued_runs r JOIN languages l ON l.id = r.language_id`,
      );
      expect(issued?.slug).toBe('go');
      const [rating] = await query<{ slug: string; rating: number; games_played: number }[]>(
        `SELECT l.slug, r.rating, r.games_played FROM language_ratings r
         JOIN languages l ON l.id = r.language_id`,
      );
      expect(rating).toEqual({ slug: 'java', rating: 640, games_played: 12 });
    });

    it('still enforces the references, now to the renamed table', async () => {
      const references = await query<{ name: string; target: string }[]>(
        `SELECT conname AS name, confrelid::regclass::text AS target FROM pg_constraint
         WHERE conname IN ('fk_play_sessions_language', 'fk_issued_runs_language',
                           'fk_language_ratings_language')
         ORDER BY conname`,
      );
      expect(references).toEqual([
        { name: 'fk_issued_runs_language', target: 'languages' },
        { name: 'fk_language_ratings_language', target: 'languages' },
        { name: 'fk_play_sessions_language', target: 'languages' },
      ]);
      await expect(
        query(
          `INSERT INTO language_ratings (user_id, language_id, rating, games_played)
           SELECT id, 999, 0, 0 FROM users`,
        ),
      ).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof QueryFailedError &&
          (error.driverError as { code?: string }).code === FOREIGN_KEY_VIOLATION,
      );
    });

    it('cannot delete a language that runs refer to', async () => {
      await expect(query(`DELETE FROM languages WHERE slug = 'python'`)).rejects.toBeInstanceOf(
        QueryFailedError,
      );
    });
  },
);
