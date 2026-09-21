import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

/**
 * The last migration turns the six natural-language pools on and leaves the code pools as they
 * were, and rolling it back turns exactly those six off again.
 */
describe.runIf(TEST_DATABASE_URL !== undefined)(
  'enabling the natural-language pools (TEST_DATABASE_URL)',
  () => {
    let database: TestDatabase;
    const enabledBy = async (track: 'code' | 'natural') =>
      (
        await database.dataSource.query<{ slug: string; enabled: boolean }[]>(
          `SELECT slug, enabled FROM languages WHERE ${
            track === 'code' ? `track = 'code'` : `track <> 'code'`
          } ORDER BY sort_order`,
        )
      ).map((row) => [row.slug, row.enabled]);

    beforeAll(async () => {
      database = await createTestDatabase(TEST_DATABASE_URL ?? '');
    });

    afterAll(async () => {
      await database.drop();
    });

    it('enables the six pools and only them, and rolls back to the same rows', async () => {
      const natural = await enabledBy('natural');
      expect(natural.map(([slug]) => slug).sort()).toEqual(
        ['en-line', 'en-paragraph', 'en-word', 'ja-line', 'ja-paragraph', 'ja-word'].sort(),
      );
      expect(natural.every(([, enabled]) => enabled === true)).toBe(true);

      // A code pool an operator has switched off stays off through both directions.
      await database.dataSource.query(`UPDATE languages SET enabled = false WHERE slug = 'java'`);
      const code = await enabledBy('code');
      await database.dataSource.undoLastMigration();
      expect((await enabledBy('natural')).every(([, enabled]) => enabled === false)).toBe(true);
      expect(await enabledBy('code')).toEqual(code);

      await database.dataSource.runMigrations();
      expect((await enabledBy('natural')).every(([, enabled]) => enabled === true)).toBe(true);
      expect(await enabledBy('code')).toEqual(code);
    });
  },
);
