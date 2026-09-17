import 'reflect-metadata';

import { BadRequestException, Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ApiErrorSchema } from '@typing-trainer/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureApp, createFastifyAdapter } from '../src/app';
import { testEnv } from './support/env';

@Controller('probe')
class ProbeController {
  @Get('bad-request')
  badRequest(): never {
    throw new BadRequestException('page must be positive');
  }

  @Get('crash')
  crash(): never {
    throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('ApiExceptionFilter', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = configureApp(
      await NestFactory.create<NestFastifyApplication>(
        ProbeModule,
        createFastifyAdapter(testEnv()),
        {
          logger: false,
        },
      ),
      testEnv(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps the message of a client error', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/probe/bad-request' });
    expect(response.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(response.json())).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'page must be positive',
    });
  });

  it('answers an unknown route with the same shape', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/nowhere' });
    expect(response.statusCode).toBe(404);
    expect(ApiErrorSchema.parse(response.json()).error).toBe('Not Found');
  });

  it('sends only the status text for an unexpected error', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/probe/crash' });
    expect(response.statusCode).toBe(500);
    expect(ApiErrorSchema.parse(response.json())).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal Server Error',
    });
    expect(response.body).not.toContain('10.0.0.5');
  });
});
