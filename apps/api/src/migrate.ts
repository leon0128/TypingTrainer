import 'reflect-metadata';

import { DataSource } from 'typeorm';

import { parseDatabaseUrl } from './config/env';
import { dataSourceOptions } from './database/data-source-options';

/**
 * Applies pending migrations and exits. The production image has no TypeORM CLI (and no tsx), so
 * this is its `migration:run`; it runs only when asked to (docs/deployment.md), never at startup,
 * because migrations are applied explicitly in every environment (§9.2). Like the CLI, it needs
 * only DATABASE_URL, not the pepper.
 */
const dataSource = new DataSource(dataSourceOptions(parseDatabaseUrl(process.env)));
await dataSource.initialize();
try {
  const applied = await dataSource.runMigrations({ transaction: 'each' });
  console.log(
    applied.length === 0
      ? 'no pending migrations'
      : `applied: ${applied.map((migration) => migration.name).join(', ')}`,
  );
} finally {
  await dataSource.destroy();
}
