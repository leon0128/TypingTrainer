import { Module, type DynamicModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { Env } from '../config/env';
import { dataSourceOptions } from './data-source-options';

@Module({})
export class DatabaseModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: DatabaseModule,
      // Fail fast on an unreachable database; the container restart policy retries (§9.6).
      imports: [
        TypeOrmModule.forRoot({ ...dataSourceOptions(env.DATABASE_URL), retryAttempts: 0 }),
      ],
    };
  }
}
