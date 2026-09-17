import type { DataSourceOptions } from 'typeorm';

import { ENTITIES } from '../entities';
import { MIGRATIONS } from '../migrations';

/** Shared by the Nest application and the TypeORM CLI, so both see the same schema. */
export function dataSourceOptions(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    applicationName: 'typing-trainer-api',
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: 'typeorm_migrations',
    // The schema changes only through reviewed migrations, in every environment (§9.2).
    synchronize: false,
    migrationsRun: false,
    // TypeORM would otherwise run CREATE EXTENSION on connect; migrations create extensions.
    installExtensions: false,
    // Ids default to gen_random_uuid(), built into PostgreSQL 13+. With the default 'uuid-ossp',
    // TypeORM reads that default as uuid_generate_v4() and reports a schema difference forever.
    uuidExtension: 'pgcrypto',
  };
}
