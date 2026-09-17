import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { CONTENT_LANGUAGES, LanguagesResponseSchema } from '@typing-trainer/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { testEnv } from './support/env';
import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

describe.runIf(TEST_DATABASE_URL !== undefined)('GET /api/languages (TEST_DATABASE_URL)', () => {
  let database: TestDatabase;
  let app: NestFastifyApplication;

  const list = async () => {
    const response = await app.inject({ method: 'GET', url: '/api/languages' });
    expect(response.statusCode).toBe(200);
    return LanguagesResponseSchema.parse(response.json()).languages;
  };

  beforeAll(async () => {
    database = await createTestDatabase(TEST_DATABASE_URL ?? '');
    app = await createApp(testEnv({ DATABASE_URL: database.url }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await database.drop();
  });

  it('lists the seeded languages in display order', async () => {
    expect(await list()).toEqual([
      { slug: 'typescript', displayName: 'TypeScript' },
      { slug: 'go', displayName: 'Go' },
      { slug: 'java', displayName: 'Java' },
      { slug: 'python', displayName: 'Python' },
    ]);
    expect((await list()).map((language) => language.slug)).toEqual([...CONTENT_LANGUAGES]);
  });

  it('follows sort_order and hides disabled languages', async () => {
    await database.dataSource.query(
      `UPDATE programming_languages SET enabled = false WHERE slug = 'java'`,
    );
    await database.dataSource.query(
      `UPDATE programming_languages SET sort_order = 0 WHERE slug = 'python'`,
    );
    expect((await list()).map((language) => language.slug)).toEqual(['python', 'typescript', 'go']);
  });
});
