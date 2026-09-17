import 'reflect-metadata';

import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { registerRequestChecks } from './common/request-checks';
import { createSchemaValidationPipe } from './common/schema-validation.pipe';
import type { Env } from './config/env';

const NEST_LOG_LEVELS = {
  fatal: ['fatal'],
  error: ['fatal', 'error'],
  warn: ['fatal', 'error', 'warn'],
  info: ['fatal', 'error', 'warn', 'log'],
  debug: ['fatal', 'error', 'warn', 'log', 'debug'],
  trace: ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'],
  silent: [],
} as const;

/** The Fastify adapter with the proxy trust and logging the environment asks for. */
export function createFastifyAdapter(env: Env): FastifyAdapter {
  return new FastifyAdapter({
    logger: env.LOG_LEVEL === 'silent' ? false : { level: env.LOG_LEVEL },
    trustProxy: env.TRUST_PROXY,
  });
}

/** Application-wide HTTP behavior, shared by the real application and tests of it. */
export function configureApp(app: NestFastifyApplication, env: Env): NestFastifyApplication {
  registerRequestChecks(app.getHttpAdapter().getInstance(), env.APP_ORIGIN);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(createSchemaValidationPipe());
  app.enableShutdownHooks();
  return app;
}

/**
 * Creates the application without listening, so tests can drive it with `inject`. Requests are
 * logged by Fastify's pino logger and framework messages by Nest's JSON console logger, so every
 * log line is structured (§9.6).
 */
export async function createApp(env: Env): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(env),
    createFastifyAdapter(env),
    { logger: new ConsoleLogger({ json: true, logLevels: [...NEST_LOG_LEVELS[env.LOG_LEVEL]] }) },
  );
  return configureApp(app, env);
}
