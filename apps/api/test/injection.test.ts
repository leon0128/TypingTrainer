import 'reflect-metadata';

import { Inject, Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { ConfigModule } from '../src/config/config.module';
import { ENV, parseEnv, type Env } from '../src/config/env';
import { missingInjections } from './support/explicit-injection';

/**
 * The API is built without decorator metadata (see apps/api/tsconfig.json), so every constructor
 * injection names its token with @Inject. These tests pin that convention under vitest's transform.
 */

@Injectable()
class ExplicitConsumer {
  constructor(@Inject(ENV) readonly env: Env) {}
}

@Injectable()
class ImplicitConsumer {
  constructor(readonly env: Env) {}
}

// Nothing here connects: the application graph below is only built in preview mode.
const env = parseEnv({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://unused@127.0.0.1:1/unused',
});

@Module({ imports: [ConfigModule.forRoot(env)], providers: [ExplicitConsumer] })
class ExplicitModule {}

@Module({ imports: [ConfigModule.forRoot(env)], providers: [ImplicitConsumer] })
class ImplicitModule {}

describe('dependency injection without decorator metadata', () => {
  it('resolves constructor parameters that name their token with @Inject', async () => {
    const context = await NestFactory.createApplicationContext(ExplicitModule, { logger: false });
    try {
      expect(context.get(ExplicitConsumer).env).toBe(env);
    } finally {
      await context.close();
    }
  });

  it('silently injects undefined, without a startup error, when @Inject is missing', async () => {
    // This is why missingInjections exists: nothing fails until the parameter is used.
    const context = await NestFactory.createApplicationContext(ImplicitModule, { logger: false });
    try {
      expect(context.get(ImplicitConsumer).env).toBeUndefined();
      expect(missingInjections(context)).toEqual(['ImplicitModule/ImplicitConsumer']);
    } finally {
      await context.close();
    }
  });

  it('still finds a missing @Inject when the graph is only previewed', async () => {
    const context = await NestFactory.createApplicationContext(ImplicitModule, {
      logger: false,
      preview: true,
    });
    try {
      expect(missingInjections(context)).toEqual(['ImplicitModule/ImplicitConsumer']);
    } finally {
      await context.close();
    }
  });

  it('finds no missing @Inject in the application', async () => {
    // Preview mode resolves the module graph without instantiating providers, so the database
    // module never connects and this runs without TEST_DATABASE_URL.
    const context = await NestFactory.createApplicationContext(AppModule.forRoot(env), {
      logger: false,
      preview: true,
    });
    try {
      expect(missingInjections(context)).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
