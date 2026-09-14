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

const env = parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });

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

  it('finds no missing @Inject in the application', async () => {
    const context = await NestFactory.createApplicationContext(AppModule.forRoot(env), {
      logger: false,
    });
    try {
      expect(missingInjections(context)).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
