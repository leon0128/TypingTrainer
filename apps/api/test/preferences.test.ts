import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ApiErrorSchema, AuthResponseSchema, PreferencesSchema } from '@typing-trainer/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { TEST_APP_ORIGIN, testEnv } from './support/env';
import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

const PASSWORD = 'correct horse battery staple';
const COOKIE = 'tt_session';

let counter = 0;
const nextUsername = () => `chooser${String((counter += 1))}`;
let addressCounter = 0;
const nextAddress = () => `198.19.0.${String((addressCounter += 1))}`;

describe.runIf(TEST_DATABASE_URL !== undefined)('/api/preferences (TEST_DATABASE_URL)', () => {
  let database: TestDatabase;
  let app: NestFastifyApplication;

  async function signedIn(timezone: string): Promise<{ id: string; token: string }> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      remoteAddress: nextAddress(),
      headers: { origin: TEST_APP_ORIGIN },
      payload: { username: nextUsername(), password: PASSWORD, timezone },
    });
    expect(response.statusCode).toBe(201);
    return {
      id: AuthResponseSchema.parse(response.json()).user.id,
      token: response.cookies.find((cookie) => cookie.name === COOKIE)?.value ?? '',
    };
  }

  const call = (token: string, method: 'GET' | 'PUT', payload?: unknown) =>
    app.inject({
      method,
      url: '/api/preferences',
      headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${token}` },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });

  beforeAll(async () => {
    database = await createTestDatabase(TEST_DATABASE_URL ?? '');
    app = await createApp(testEnv({ DATABASE_URL: database.url, REGISTRATION_DAILY_LIMIT: '500' }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await database.drop();
  });

  it('starts in English with the time zone the account was created with', async () => {
    const me = await signedIn('Asia/Tokyo');
    const response = await call(me.token, 'GET');
    expect(response.statusCode).toBe(200);
    expect(PreferencesSchema.parse(response.json())).toEqual({
      timezone: 'Asia/Tokyo',
      locale: 'en',
    });
  });

  it('changes the display language, and every later read sees it', async () => {
    const me = await signedIn('America/New_York');
    const put = await call(me.token, 'PUT', { locale: 'ja' });
    expect(put.statusCode).toBe(200);
    expect(PreferencesSchema.parse(put.json())).toEqual({
      timezone: 'America/New_York',
      locale: 'ja',
    });

    expect(PreferencesSchema.parse((await call(me.token, 'GET')).json()).locale).toBe('ja');
    const account = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${me.token}` },
    });
    expect(AuthResponseSchema.parse(account.json()).user.locale).toBe('ja');

    await call(me.token, 'PUT', { locale: 'en' });
    expect(PreferencesSchema.parse((await call(me.token, 'GET')).json()).locale).toBe('en');
  });

  it("leaves other players' settings alone", async () => {
    const me = await signedIn('UTC');
    const other = await signedIn('UTC');
    await call(me.token, 'PUT', { locale: 'ja' });
    expect(PreferencesSchema.parse((await call(other.token, 'GET')).json()).locale).toBe('en');
  });

  it.each([
    ['an unknown language', { locale: 'fr' }],
    ['a language of the wrong type', { locale: 1 }],
    ['nothing at all', {}],
    ['a time zone, which is not editable', { timezone: 'Asia/Tokyo' }],
    ['a language together with a time zone', { locale: 'ja', timezone: 'Asia/Tokyo' }],
    ['an unknown setting', { locale: 'ja', theme: 'dark' }],
  ])('refuses %s', async (_name, payload) => {
    const me = await signedIn('Europe/Paris');
    const response = await call(me.token, 'PUT', payload);
    expect(response.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(response.json()).statusCode).toBe(400);
    // Nothing was applied, and in particular the time zone is as it was.
    expect(PreferencesSchema.parse((await call(me.token, 'GET')).json())).toEqual({
      timezone: 'Europe/Paris',
      locale: 'en',
    });
  });

  it('requires a session', async () => {
    for (const method of ['GET', 'PUT'] as const) {
      const response = await app.inject({
        method,
        url: '/api/preferences',
        headers: { origin: TEST_APP_ORIGIN },
        ...(method === 'PUT' ? { payload: { locale: 'ja' } } : {}),
      });
      expect(response.statusCode).toBe(401);
    }
  });

  it('refuses a language the database does not know, whatever wrote it', async () => {
    const me = await signedIn('UTC');
    await expect(
      database.dataSource.query(`UPDATE users SET locale = 'fr' WHERE id = $1`, [me.id]),
    ).rejects.toThrow(/chk_users_locale/);
  });
});
