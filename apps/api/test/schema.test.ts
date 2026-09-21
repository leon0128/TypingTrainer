import {
  CODE_LANGUAGES,
  CONTENT_LANGUAGES,
  POOLS,
  UsernameSchema,
} from '@typing-trainer/contracts';
import { RUN_BLOCK_COUNTS } from '@typing-trainer/typing-engine';
import { QueryFailedError } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MIGRATIONS } from '../src/migrations';
import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

/** The PostgreSQL error code of a failed query, or undefined when it succeeds. */
async function sqlState(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    if (!(error instanceof QueryFailedError)) throw error;
    return (error.driverError as { code?: string }).code;
  }
}

/** The schema as PostgreSQL normalizes it, excluding TypeORM's migration bookkeeping table. */
async function catalog({ dataSource }: TestDatabase): Promise<unknown> {
  const exclude = 'typeorm_migrations';
  const [columns, constraints, indexes] = await Promise.all([
    dataSource.query<unknown[]>(
      `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default,
              numeric_precision, numeric_scale
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name <> $1
       ORDER BY table_name, column_name`,
      [exclude],
    ),
    dataSource.query<unknown[]>(
      `SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE connamespace = 'public'::regnamespace AND conrelid::regclass::text <> $1
       ORDER BY table_name, conname`,
      [exclude],
    ),
    dataSource.query<unknown[]>(
      `SELECT tablename, indexname, indexdef
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename <> $1
       ORDER BY tablename, indexname`,
      [exclude],
    ),
  ]);
  return { columns, constraints, indexes };
}

type Row = Record<string, string | number | null>;

const SINGLE_RUN: Row = {
  mode: 'single',
  language_id: 1,
  started_at: '2026-09-15T01:00:00Z',
  timezone: 'Asia/Tokyo',
  local_date: '2026-09-15',
  local_week_start: '2026-09-13',
  raw_keystrokes: 420,
  effective_keystrokes: 400,
  miss_count: 20,
  kpm: '200.00',
  accuracy: '0.9524',
  score: 190,
  cpu_level: null,
  ghost_period: null,
  opponent_score: null,
  result: null,
  rng_seed: '42',
  content_revision: 'abc123',
  app_version: '0.0.0',
};

describe.runIf(TEST_DATABASE_URL !== undefined)('initial schema (TEST_DATABASE_URL)', () => {
  let database: TestDatabase;
  let userId: string;

  const query = <T>(sql: string, parameters: unknown[] = []) =>
    database.dataSource.query<T>(sql, parameters);

  const insertRun = (overrides: Row) => {
    const row = { ...SINGLE_RUN, user_id: userId, ...overrides };
    const columns = Object.keys(row);
    return query(
      `INSERT INTO play_sessions (${columns.join(', ')}) VALUES (${columns
        .map((_, index) => `$${String(index + 1)}`)
        .join(', ')})`,
      Object.values(row),
    );
  };

  beforeAll(async () => {
    database = await createTestDatabase(TEST_DATABASE_URL ?? '');
    const [user] = await query<{ id: string }[]>(
      `INSERT INTO users (username, password_hash) VALUES ('Alice', 'hash') RETURNING id`,
    );
    userId = user?.id ?? '';
  });

  afterAll(async () => {
    await database.drop();
  });

  it('matches the entities, so migration:check finds nothing to generate', async () => {
    const pending = await database.dataSource.driver.createSchemaBuilder().log();
    expect(pending.upQueries.map((upQuery) => upQuery.query)).toEqual([]);
  });

  it('has exactly the columns, constraints, and indexes the entities describe', async () => {
    // migration:check compares CHECK constraints by name only, so an expression edited in an
    // entity but not in a migration (or the reverse) passes it. Here a throwaway database is built
    // straight from the entities, and PostgreSQL's own normalized definitions are compared.
    // synchronize() is used for this reference database only; the application never calls it.
    const reference = await createTestDatabase(TEST_DATABASE_URL ?? '', { migrate: false });
    try {
      await reference.dataSource.query('CREATE EXTENSION IF NOT EXISTS citext');
      await reference.dataSource.synchronize();
      expect(await catalog(database)).toEqual(await catalog(reference));
    } finally {
      await reference.drop();
    }
  });

  it('seeds one language per pool, with fixed ids in pool order and the track and kind of POOLS', async () => {
    const rows = await query<
      { id: number; slug: string; enabled: boolean; track: string; kind: string | null }[]
    >('SELECT id, slug, enabled, track, kind FROM languages ORDER BY sort_order');
    expect(rows.map((row) => row.slug)).toEqual([...CONTENT_LANGUAGES]);
    expect(rows.map((row) => row.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const row of rows) {
      expect({ track: row.track, kind: row.kind }, row.slug).toEqual(
        POOLS[row.slug as keyof typeof POOLS],
      );
    }
  });

  it('seeds the natural-language pools disabled, and the last migration turns them on', async () => {
    const rows = await query<{ slug: string; enabled: boolean }[]>(
      'SELECT slug, enabled FROM languages ORDER BY sort_order',
    );
    // They are added disabled and enabled by their own migration, once the API and web serve them
    // (§13), so every pool is on here and the ones outside the code track are exactly six.
    expect(rows.every((row) => row.enabled)).toBe(true);
    expect(
      rows.map((row) => row.slug).filter((slug) => !CODE_LANGUAGES.includes(slug as never)),
    ).toHaveLength(6);
  });

  describe("a language row's track and kind", () => {
    const insertLanguage = (track: string, kind: string | null) =>
      sqlState(() =>
        query(
          `INSERT INTO languages (id, slug, display_name, sort_order, track, kind)
           VALUES (900, 'probe', 'Probe', 900, $1, $2)`,
          [track, kind],
        ),
      );

    it.each([
      ['code', null],
      ['natural-ja', 'word'],
      ['natural-ja', 'line'],
      ['natural-en', 'paragraph'],
    ])('accepts track %s with kind %s', async (track, kind) => {
      expect(await insertLanguage(track, kind)).toBeUndefined();
      await query(`DELETE FROM languages WHERE id = 900`);
    });

    it.each([
      ['a programming language with a kind', 'code', 'word'],
      ['a natural-language pool with no kind', 'natural-ja', null],
      ['a natural-language pool with an unknown kind', 'natural-en', 'chapter'],
      ['an unknown track', 'natural-fr', 'word'],
    ])('refuses %s', async (_description, track, kind) => {
      expect(await insertLanguage(track, kind)).toBe(CHECK_VIOLATION);
    });

    it('needs the track to be stated', async () => {
      expect(
        await sqlState(() =>
          query(
            `INSERT INTO languages (id, slug, display_name, sort_order)
             VALUES (900, 'probe', 'Probe', 900)`,
          ),
        ),
      ).toBe('23502');
    });
  });

  describe('the number of blocks an issued run holds (§13.7)', () => {
    const issue = (count: number) =>
      sqlState(() =>
        query(
          `INSERT INTO issued_runs (user_id, language_id, mode, rng_seed, content_revision, block_ids)
           VALUES ($1, 1, 'single', 1, 'rev', $2)`,
          [userId, Array.from({ length: count }, (_, index) => `go/block-${String(index)}`)],
        ),
      );

    it.each([1, 20, 80, 300])('accepts %i blocks', async (count) => {
      expect(await issue(count)).toBeUndefined();
    });

    it.each([0, 301, 500])('refuses %i blocks', async (count) => {
      expect(await issue(count)).toBe(CHECK_VIOLATION);
    });

    it('is bounded by the most blocks any run takes', () => {
      expect(300).toBe(Math.max(...Object.values(RUN_BLOCK_COUNTS)));
    });
  });

  it.each([
    'abc',
    'Alice_2',
    'a-b',
    '9lives',
    'x'.repeat(24),
    'ab',
    'x'.repeat(25),
    '_alice',
    '-alice',
    'a b',
    'alice!',
    'ユーザー名です',
  ])('agrees with UsernameSchema about %s', async (username) => {
    const state = await sqlState(() =>
      query(
        `INSERT INTO users (username, password_hash) VALUES ($1, 'hash')
         ON CONFLICT (username) DO NOTHING`,
        [username],
      ),
    );
    expect(state === undefined).toBe(UsernameSchema.safeParse(username).success);
    if (state !== undefined) expect(state).toBe(CHECK_VIOLATION);
  });

  it('treats usernames case-insensitively', async () => {
    expect(
      await sqlState(() =>
        query(`INSERT INTO users (username, password_hash) VALUES ('alice', 'hash')`),
      ),
    ).toBe(UNIQUE_VIOLATION);
  });

  it('accepts a single play, a vs CPU run, and a Ghost run', async () => {
    expect(await sqlState(() => insertRun({}))).toBeUndefined();
    expect(
      await sqlState(() =>
        insertRun({ mode: 'cpu', cpu_level: 48, opponent_score: 185, result: 'win' }),
      ),
    ).toBeUndefined();
    expect(
      await sqlState(() =>
        insertRun({ mode: 'ghost', ghost_period: 'weekly', opponent_score: 190, result: 'lose' }),
      ),
    ).toBeUndefined();
  });

  it.each<[string, Row]>([
    ['an unknown mode', { mode: 'practice' }],
    ['a single play with a result', { result: 'win' }],
    // The three NULL cases below would pass a CHECK that compares without IS NOT NULL.
    ['a vs CPU run without a level', { mode: 'cpu', opponent_score: 100, result: 'win' }],
    ['a vs CPU run without a result', { mode: 'cpu', cpu_level: 10, opponent_score: 64 }],
    ['a Ghost run without a period', { mode: 'ghost', opponent_score: 1, result: 'win' }],
    ['a level above 100', { mode: 'cpu', cpu_level: 101, opponent_score: 900, result: 'lose' }],
    [
      'a Ghost run with a CPU level',
      {
        mode: 'ghost',
        ghost_period: 'daily',
        cpu_level: 3,
        opponent_score: 1,
        result: 'win',
      },
    ],
    [
      'an unknown Ghost period',
      { mode: 'ghost', ghost_period: 'monthly', opponent_score: 1, result: 'win' },
    ],
    ['a draw stored as a result', { mode: 'cpu', cpu_level: 1, opponent_score: 1, result: 'draw' }],
    ['accuracy above 1', { accuracy: '1.0001' }],
    ['a negative miss count', { miss_count: -1 }],
    ['a week that does not start on Sunday', { local_week_start: '2026-09-14' }],
  ])('rejects %s', async (_, overrides) => {
    expect(await sqlState(() => insertRun(overrides))).toBe(CHECK_VIOLATION);
  });

  it('rejects a session that expires before it was created', async () => {
    expect(
      await sqlState(() =>
        query(
          `INSERT INTO auth_sessions (id, user_id, created_at, expires_at)
           VALUES ('token-hash', $1, now(), now() - interval '1 second')`,
          [userId],
        ),
      ),
    ).toBe(CHECK_VIOLATION);
  });

  it('deletes a user together with their runs and sessions', async () => {
    const [other] = await query<{ id: string }[]>(
      `INSERT INTO users (username, password_hash) VALUES ('bob', 'hash') RETURNING id`,
    );
    const otherId = other?.id ?? '';
    await insertRun({ user_id: otherId });
    await query(
      `INSERT INTO auth_sessions (id, user_id, expires_at) VALUES ('bob-token', $1, now() + interval '30 days')`,
      [otherId],
    );
    await query('DELETE FROM users WHERE id = $1', [otherId]);
    const [counts] = await query<{ runs: string; sessions: string }[]>(
      `SELECT (SELECT count(*) FROM play_sessions WHERE user_id = $1) AS runs,
              (SELECT count(*) FROM auth_sessions WHERE user_id = $1) AS sessions`,
      [otherId],
    );
    expect(counts).toEqual({ runs: '0', sessions: '0' });
  });
});

describe.runIf(TEST_DATABASE_URL !== undefined)('migration reversal (TEST_DATABASE_URL)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase(TEST_DATABASE_URL ?? '');
  });

  afterAll(async () => {
    await database.drop();
  });

  it('reverts every migration to an empty schema without citext and applies them again', async () => {
    const { dataSource } = database;
    for (let remaining = MIGRATIONS.length; remaining > 0; remaining -= 1) {
      await dataSource.undoLastMigration();
    }
    const tables = await dataSource.query<{ tablename: string }[]>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    expect(tables.map((table) => table.tablename)).toEqual(['typeorm_migrations']);
    const extensions = await dataSource.query<{ extname: string }[]>(
      `SELECT extname FROM pg_extension WHERE extname = 'citext'`,
    );
    expect(extensions).toEqual([]);

    expect((await dataSource.runMigrations()).length).toBe(MIGRATIONS.length);
    expect(await dataSource.showMigrations()).toBe(false);
  });
});
