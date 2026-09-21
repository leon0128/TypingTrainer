import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

/**
 * The migration that moves the play screen's font, size, and colour set from one row per user to
 * one row per user and track (§13.10) must give every account with a saved look that look on its
 * code track, and leave the others to their defaults. The database is migrated, rolled back one
 * step, filled, and migrated again.
 */
describe.runIf(TEST_DATABASE_URL !== undefined)(
  'moving the play look to one row per track (TEST_DATABASE_URL)',
  () => {
    let database: TestDatabase;
    const query = <T>(sql: string, parameters: unknown[] = []) =>
      database.dataSource.query<T>(sql, parameters);

    beforeAll(async () => {
      database = await createTestDatabase(TEST_DATABASE_URL ?? '');
    });

    afterAll(async () => {
      await database.drop();
    });

    const addUser = async (name: string) =>
      (
        await query<{ id: string }[]>(
          `INSERT INTO users (username, password_hash) VALUES ($1, 'hash') RETURNING id`,
          [name],
        )
      )[0]?.id ?? '';

    it('gives a saved look to the code track, and rolls back to the one row', async () => {
      // Past the migration that enables the natural-language pools, then this one.
      await database.dataSource.undoLastMigration();
      await database.dataSource.undoLastMigration();
      const columns = await query<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'user_preferences'`,
      );
      expect(columns.map((column) => column.column_name)).toEqual(
        expect.arrayContaining(['font', 'font_size', 'color_preset']),
      );

      const chosen = await addUser('Chooser');
      const untouched = await addUser('Untouched');
      await query(
        `INSERT INTO user_preferences (user_id, font, font_size, color_preset, theme)
         VALUES ($1, 'fira-code', 24, 'okabe-ito', 'dark')`,
        [chosen],
      );
      await database.dataSource.runMigrations();

      const rows = await query<
        { user_id: string; track: string; font: string; font_size: number; color_preset: string }[]
      >(`SELECT * FROM user_play_appearance ORDER BY user_id`);
      expect(rows).toEqual([
        {
          user_id: chosen,
          track: 'code',
          font: 'fira-code',
          font_size: 24,
          color_preset: 'okabe-ito',
        },
      ]);
      expect(rows.some((row) => row.user_id === untouched)).toBe(false);

      // What is not about the play look stays where it was.
      const [kept] = await query<{ theme: string }[]>(
        'SELECT theme FROM user_preferences WHERE user_id = $1',
        [chosen],
      );
      expect(kept?.theme).toBe('dark');
      const after = await query<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'user_preferences'`,
      );
      for (const dropped of ['font', 'font_size', 'color_preset']) {
        expect(after.map((column) => column.column_name)).not.toContain(dropped);
      }

      // Rolled back, the code track's look is the single row's again.
      await query(
        `UPDATE user_play_appearance SET font_size = 14 WHERE user_id = $1 AND track = 'code'`,
        [chosen],
      );
      await database.dataSource.undoLastMigration();
      await database.dataSource.undoLastMigration();
      const [back] = await query<{ font: string; font_size: number; color_preset: string }[]>(
        'SELECT font, font_size, color_preset FROM user_preferences WHERE user_id = $1',
        [chosen],
      );
      expect(back).toEqual({ font: 'fira-code', font_size: 14, color_preset: 'okabe-ito' });
    });
  },
);
