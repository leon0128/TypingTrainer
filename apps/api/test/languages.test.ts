import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  AuthResponseSchema,
  CODE_LANGUAGES,
  LanguagesResponseSchema,
} from '@typing-trainer/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { TEST_APP_ORIGIN, testEnv } from './support/env';
import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

const COOKIE = 'tt_session';

describe.runIf(TEST_DATABASE_URL !== undefined)('GET /api/languages (TEST_DATABASE_URL)', () => {
  let database: TestDatabase;
  let app: NestFastifyApplication;
  let token = '';
  let counter = 0;

  const signIn = async (): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      remoteAddress: `192.0.2.${String((counter += 1))}`,
      headers: { origin: TEST_APP_ORIGIN },
      payload: { username: `lister${String(counter)}`, password: 'correct horse battery staple' },
    });
    expect(response.statusCode).toBe(201);
    AuthResponseSchema.parse(response.json());
    return response.cookies.find((cookie) => cookie.name === COOKIE)?.value ?? '';
  };

  const list = async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/languages',
      headers: { cookie: `${COOKIE}=${token}` },
    });
    expect(response.statusCode).toBe(200);
    return LanguagesResponseSchema.parse(response.json()).languages;
  };

  beforeAll(async () => {
    database = await createTestDatabase(TEST_DATABASE_URL ?? '');
    app = await createApp(testEnv({ DATABASE_URL: database.url }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    token = await signIn();
  });

  afterAll(async () => {
    await app.close();
    await database.drop();
  });

  it('is not public: what is listed depends on the account', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/languages' });
    expect(response.statusCode).toBe(401);
  });

  it('lists the seeded languages in display order, with their track', async () => {
    const languages = await list();
    expect(languages.filter((language) => language.track === 'code')).toEqual([
      { slug: 'typescript', displayName: 'TypeScript', track: 'code', kind: null },
      { slug: 'go', displayName: 'Go', track: 'code', kind: null },
      { slug: 'java', displayName: 'Java', track: 'code', kind: null },
      { slug: 'python', displayName: 'Python', track: 'code', kind: null },
    ]);
    expect(languages.map((language) => language.slug)).toEqual([
      ...CODE_LANGUAGES,
      'en-word',
      'en-line',
      'en-paragraph',
    ]);
  });

  it('follows sort_order and hides disabled languages', async () => {
    await database.dataSource.query(`UPDATE languages SET enabled = false WHERE slug = 'java'`);
    await database.dataSource.query(`UPDATE languages SET sort_order = 0 WHERE slug = 'python'`);
    expect((await list()).map((language) => language.slug)).toEqual([
      'python',
      'typescript',
      'go',
      'en-word',
      'en-line',
      'en-paragraph',
    ]);
  });
});
