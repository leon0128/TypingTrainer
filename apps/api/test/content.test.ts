import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { HealthResponseSchema, LanguagesResponseSchema } from '@typing-trainer/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { testEnv } from './support/env';
import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

describe.runIf(TEST_DATABASE_URL !== undefined)(
  'content bundles against the languages table (TEST_DATABASE_URL)',
  () => {
    const cleanup: (() => Promise<void>)[] = [];

    afterEach(async () => {
      for (const step of cleanup.splice(0).reverse()) await step();
    });

    async function database(): Promise<TestDatabase> {
      const created = await createTestDatabase(TEST_DATABASE_URL ?? '');
      cleanup.push(() => created.drop());
      return created;
    }

    /** Creates and initializes the application; initialization runs the startup check. */
    async function start(databaseUrl: string): Promise<NestFastifyApplication> {
      const app = await createApp(testEnv({ DATABASE_URL: databaseUrl }));
      cleanup.push(() => app.close());
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
      return app;
    }

    it('starts when every enabled language has a bundle and every bundle has a language', async () => {
      const app = await start((await database()).url);
      const ready = await app.inject({ method: 'GET', url: '/api/health/ready' });
      expect(ready.statusCode).toBe(200);
      expect(HealthResponseSchema.parse(ready.json()).checks).toContainEqual({
        name: 'content',
        ok: true,
      });
    });

    it('refuses to start with an enabled language that has no bundle', async () => {
      const db = await database();
      await db.dataSource.query(
        `INSERT INTO programming_languages (id, slug, display_name, sort_order) VALUES (5, 'rust', 'Rust', 5)`,
      );
      await expect(start(db.url)).rejects.toThrow(
        /language "rust" is enabled but has no content bundle/,
      );
    });

    it('refuses to start with a bundle that has no language row', async () => {
      const db = await database();
      await db.dataSource.query(`DELETE FROM programming_languages WHERE slug = 'python'`);
      await expect(start(db.url)).rejects.toThrow(
        /content bundle "python" has no programming_languages row/,
      );
    });

    it('starts with a disabled language that keeps its bundle, and does not list it', async () => {
      const db = await database();
      await db.dataSource.query(
        `UPDATE programming_languages SET enabled = false WHERE slug = 'go'`,
      );
      const app = await start(db.url);
      const response = await app.inject({ method: 'GET', url: '/api/languages' });
      expect(LanguagesResponseSchema.parse(response.json()).languages.map((l) => l.slug)).toEqual([
        'typescript',
        'java',
        'python',
      ]);
    });

    it('reports a language enabled while running as not ready, and leaves it out of the list', async () => {
      const db = await database();
      const app = await start(db.url);
      await db.dataSource.query(
        `INSERT INTO programming_languages (id, slug, display_name, sort_order) VALUES (5, 'typescript-next', 'TS Next', 5)`,
      );
      const ready = await app.inject({ method: 'GET', url: '/api/health/ready' });
      expect(ready.statusCode).toBe(503);
      expect(HealthResponseSchema.parse(ready.json()).checks).toContainEqual({
        name: 'content',
        ok: false,
        detail: 'inconsistent',
      });
      const response = await app.inject({ method: 'GET', url: '/api/languages' });
      expect(LanguagesResponseSchema.parse(response.json()).languages).toHaveLength(4);
    });
  },
);
