import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { HealthResponseSchema } from '@typing-trainer/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { testEnv } from './support/env';
import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

async function startApp(databaseUrl: string): Promise<NestFastifyApplication> {
  const app = await createApp(testEnv({ DATABASE_URL: databaseUrl }));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe.runIf(TEST_DATABASE_URL !== undefined)('health endpoints (TEST_DATABASE_URL)', () => {
  describe('with every migration applied', () => {
    let database: TestDatabase;
    let app: NestFastifyApplication;

    beforeAll(async () => {
      database = await createTestDatabase(TEST_DATABASE_URL ?? '');
      app = await startApp(database.url);
    });

    afterAll(async () => {
      await app.close();
      await database.drop();
    });

    it('reports liveness under the /api prefix', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/health/live' });
      expect(response.statusCode).toBe(200);
      expect(HealthResponseSchema.parse(response.json())).toEqual({ status: 'ok', checks: [] });
    });

    it('does not serve routes outside the prefix', async () => {
      const response = await app.inject({ method: 'GET', url: '/health/live' });
      expect(response.statusCode).toBe(404);
    });

    it('is ready', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/health/ready' });
      expect(response.statusCode).toBe(200);
      expect(HealthResponseSchema.parse(response.json()).checks).toEqual([
        { name: 'database', ok: true },
        { name: 'migrations', ok: true },
      ]);
    });
  });

  describe('with migrations not yet applied', () => {
    let database: TestDatabase;
    let app: NestFastifyApplication;

    beforeAll(async () => {
      database = await createTestDatabase(TEST_DATABASE_URL ?? '', { migrate: false });
      app = await startApp(database.url);
    });

    afterAll(async () => {
      await app.close();
      await database.drop();
    });

    it('answers 503 with the pending check, so a forgotten migration is visible', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/health/ready' });
      expect(response.statusCode).toBe(503);
      expect(HealthResponseSchema.parse(response.json())).toEqual({
        status: 'unavailable',
        checks: [
          { name: 'database', ok: true },
          { name: 'migrations', ok: false, detail: 'pending' },
        ],
      });
    });
  });
});
