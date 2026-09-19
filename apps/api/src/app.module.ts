import { Module, type DynamicModule } from '@nestjs/common';

import { ConfigModule } from './config/config.module';
import type { Env } from './config/env';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { ContentModule } from './modules/content/content.module';
import { HealthModule } from './modules/health/health.module';
import { LanguagesModule } from './modules/languages/languages.module';
import { PlayModule } from './modules/play/play.module';
import { RankingsModule } from './modules/rankings/rankings.module';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        DatabaseModule.forRoot(env),
        ContentModule,
        AuthModule,
        HealthModule,
        LanguagesModule,
        PlayModule,
        RankingsModule,
      ],
    };
  }
}
