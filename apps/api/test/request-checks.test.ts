import 'reflect-metadata';

import { Body, Controller, Get, Module, Post, Req } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ApiErrorSchema } from '@typing-trainer/contracts';
import type { FastifyRequest } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureApp, createFastifyAdapter } from '../src/app';
import { checkRequest } from '../src/common/request-checks';
import { TEST_APP_ORIGIN, testEnv } from './support/env';

const ORIGIN = 'https://typing.example.com';

describe('checkRequest', () => {
  const check = (method: string, headers: Record<string, string>) =>
    checkRequest(method, headers, ORIGIN)?.statusCode;

  it('ignores safe methods', () => {
    expect(check('GET', {})).toBeUndefined();
    expect(check('HEAD', { origin: 'https://evil.example' })).toBeUndefined();
    expect(check('OPTIONS', {})).toBeUndefined();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'post'])(
    'requires the app origin for %s',
    (method) => {
      expect(check(method, { origin: ORIGIN })).toBeUndefined();
      expect(check(method, {})).toBe(403);
      expect(check(method, { origin: 'https://evil.example' })).toBe(403);
    },
  );

  it('compares the whole origin: scheme, host, and port', () => {
    expect(check('POST', { origin: 'http://typing.example.com' })).toBe(403);
    expect(check('POST', { origin: 'https://typing.example.com:8443' })).toBe(403);
    expect(check('POST', { origin: 'https://typing.example.com.evil.example' })).toBe(403);
    expect(check('POST', { origin: 'null' })).toBe(403);
    expect(check('POST', { origin: 'not a url' })).toBe(403);
  });

  it('falls back to the Referer origin only when Origin is absent', () => {
    expect(check('POST', { referer: `${ORIGIN}/play?lang=go` })).toBeUndefined();
    expect(check('POST', { referer: 'https://evil.example/page' })).toBe(403);
    expect(check('POST', { origin: 'https://evil.example', referer: `${ORIGIN}/` })).toBe(403);
  });

  it('requires JSON when there is a body, whatever else the request looks like', () => {
    const fromApp = { origin: ORIGIN, 'content-length': '12' };
    expect(check('POST', { ...fromApp, 'content-type': 'application/json' })).toBeUndefined();
    expect(
      check('POST', { ...fromApp, 'content-type': 'Application/JSON; charset=utf-8' }),
    ).toBeUndefined();
    expect(check('POST', { ...fromApp, 'content-type': 'application/x-www-form-urlencoded' })).toBe(
      415,
    );
    expect(check('POST', { ...fromApp, 'content-type': 'text/plain' })).toBe(415);
    expect(check('POST', { ...fromApp, 'content-type': 'multipart/form-data; boundary=x' })).toBe(
      415,
    );
    expect(check('POST', fromApp)).toBe(415);
    expect(check('POST', { origin: ORIGIN, 'transfer-encoding': 'chunked' })).toBe(415);
    expect(check('POST', { origin: ORIGIN, 'content-length': '0' })).toBeUndefined();
    expect(check('POST', { origin: ORIGIN })).toBeUndefined();
  });

  it('checks the origin before the media type', () => {
    expect(check('POST', { 'content-length': '3', 'content-type': 'text/plain' })).toBe(403);
  });
});

@Controller('probe')
class ProbeController {
  @Post('echo')
  echo(@Body() body: unknown): unknown {
    return body;
  }

  @Get('ip')
  ip(@Req() request: FastifyRequest): { ip: string } {
    return { ip: request.ip };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

async function startProbe(overrides: Record<string, string> = {}): Promise<NestFastifyApplication> {
  const env = testEnv(overrides);
  const app = configureApp(
    await NestFactory.create<NestFastifyApplication>(ProbeModule, createFastifyAdapter(env), {
      logger: false,
    }),
    env,
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('request checks in the application', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await startProbe();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets a JSON request from the app origin through to the handler', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/probe/echo',
      headers: { origin: TEST_APP_ORIGIN },
      payload: { ok: true },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ ok: true });
  });

  it('refuses a cross-origin request with 403 in the ApiError shape, before routing', async () => {
    for (const url of ['/api/probe/echo', '/api/does-not-exist']) {
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { origin: 'https://evil.example' },
        payload: { ok: true },
      });
      expect(response.statusCode).toBe(403);
      expect(ApiErrorSchema.parse(response.json()).message).toBe('cross-origin request refused');
    }
  });

  it('refuses a form post from the app origin with 415, before the form parser runs', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/probe/echo',
      headers: {
        origin: TEST_APP_ORIGIN,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: 'ok=true',
    });
    expect(response.statusCode).toBe(415);
    expect(ApiErrorSchema.parse(response.json()).statusCode).toBe(415);
  });
});

describe('TRUST_PROXY', () => {
  const ipFor = async (overrides: Record<string, string>) => {
    const app = await startProbe(overrides);
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/probe/ip',
        remoteAddress: '10.0.0.2',
        headers: { 'x-forwarded-for': '203.0.113.7' },
      });
      return response.json<{ ip: string }>().ip;
    } finally {
      await app.close();
    }
  };

  it('ignores X-Forwarded-For unless the proxy is trusted', async () => {
    expect(await ipFor({})).toBe('10.0.0.2');
    expect(await ipFor({ TRUST_PROXY: '10.0.0.0/8' })).toBe('203.0.113.7');
    expect(await ipFor({ TRUST_PROXY: '192.168.0.1' })).toBe('10.0.0.2');
  });
});
