import 'reflect-metadata';

import { Body, Controller, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ApiErrorSchema,
  RegisterRequestSchema,
  type RegisterRequest,
} from '@typing-trainer/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureApp, createFastifyAdapter } from '../src/app';
import { TEST_APP_ORIGIN, testEnv } from './support/env';

@Controller('probe')
class ProbeController {
  @Post('register')
  register(@Body({ schema: RegisterRequestSchema }) body: RegisterRequest): RegisterRequest {
    return body;
  }

  @Post('unchecked')
  unchecked(@Body() body: unknown): unknown {
    return body;
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('schema validation pipe', () => {
  let app: NestFastifyApplication;

  const post = (url: string, payload: unknown) =>
    app.inject({
      method: 'POST',
      url: `/api/probe/${url}`,
      headers: { origin: TEST_APP_ORIGIN },
      payload: payload as object,
    });

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

  it('hands the handler the parsed value, with defaults and transforms applied', async () => {
    const response = await post('register', {
      username: 'alice',
      password: 'correct horse battery',
      timezone: 'asia/tokyo',
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      username: 'alice',
      password: 'correct horse battery',
      timezone: 'Asia/Tokyo',
    });
  });

  it('answers invalid input with 400 and path-prefixed messages, never echoing values', async () => {
    const secret = 'tiny-secret';
    const response = await post('register', { username: 'a!', password: secret });
    expect(response.statusCode).toBe(400);
    const error = ApiErrorSchema.parse(response.json());
    expect(error.error).toBe('Bad Request');
    expect(error.message).toContain('username: ');
    expect(error.message).toContain('password: must be at least 15 characters');
    expect(response.body).not.toContain(secret);
  });

  it('rejects a body that is not an object', async () => {
    const response = await post('register', ['alice']);
    expect(response.statusCode).toBe(400);
  });

  it('leaves parameters without a schema untouched', async () => {
    const response = await post('unchecked', { anything: 1 });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ anything: 1 });
  });
});
