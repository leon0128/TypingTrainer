import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { HealthResponseSchema } from '@typing-trainer/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { parseEnv } from '../src/config/env';

describe('health', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp(parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports liveness under the /api prefix without touching the database', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health/live' });
    expect(response.statusCode).toBe(200);
    expect(HealthResponseSchema.parse(response.json())).toEqual({ status: 'ok', checks: [] });
  });

  it('does not serve routes outside the prefix', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/live' });
    expect(response.statusCode).toBe(404);
  });
});
