import 'reflect-metadata';

import { randomBytes } from 'node:crypto';

import pg from 'pg';
import { DataSource } from 'typeorm';

import { dataSourceOptions } from '../../src/database/data-source-options';

/**
 * Integration tests run only when TEST_DATABASE_URL points at a PostgreSQL server whose user may
 * create databases, as in the CI api job; `pnpm test` without it skips them.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// The CI api job sets REQUIRE_TEST_DATABASE, so losing TEST_DATABASE_URL fails there instead of
// silently skipping every database test.
if (process.env.REQUIRE_TEST_DATABASE === '1' && TEST_DATABASE_URL === undefined) {
  throw new Error('REQUIRE_TEST_DATABASE is set but TEST_DATABASE_URL is not');
}

export interface TestDatabase {
  readonly url: string;
  /** A data source for the database, initialized, with the application's entities. */
  readonly dataSource: DataSource;
  drop(): Promise<void>;
}

/**
 * Creates a uniquely named empty database on the TEST_DATABASE_URL server, so test files can run
 * in parallel and never see each other's rows. Migrations run unless `migrate` is false.
 */
export async function createTestDatabase(
  adminUrl: string,
  { migrate = true }: { migrate?: boolean } = {},
): Promise<TestDatabase> {
  const name = `tt_test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const dataSource = new DataSource(dataSourceOptions(url.toString()));
  await dataSource.initialize();
  if (migrate) {
    await dataSource.runMigrations();
  }

  return {
    url: url.toString(),
    dataSource,
    async drop() {
      await dataSource.destroy();
      const cleanup = new pg.Client({ connectionString: adminUrl });
      await cleanup.connect();
      try {
        await cleanup.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
