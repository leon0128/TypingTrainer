import 'reflect-metadata';

import { DataSource } from 'typeorm';

import { parseDatabaseUrl } from '../config/env';
import { dataSourceOptions } from './data-source-options';

/** Loaded only by the TypeORM CLI (the `migration:*` scripts in apps/api/package.json). */
export default new DataSource(dataSourceOptions(parseDatabaseUrl(process.env)));
