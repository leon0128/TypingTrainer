import { hash } from '@node-rs/argon2';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ApiErrorSchema, AuthResponseSchema } from '@typing-trainer/contracts';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app';
import { SessionsRepository } from '../src/modules/auth/sessions.repository';
import { hashSessionToken } from '../src/modules/auth/sessions.service';
import { PASSWORD_HASH_OPTIONS, PasswordHasher } from '../src/modules/auth/password-hasher';
import { TEST_APP_ORIGIN, TEST_PASSWORD_PEPPER, testEnv } from './support/env';
import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

const COOKIE = 'tt_session';
const PASSWORD = 'correct horse battery staple';

let addressCounter = 0;
/** A fresh client address, so per-address limits of one test never affect another. */
const nextAddress = () => `198.51.100.${String((addressCounter += 1))}`;

let usernameCounter = 0;
const nextUsername = (prefix = 'user') => `${prefix}${String((usernameCounter += 1))}`;

async function startApp(database: TestDatabase, overrides: Record<string, string> = {}) {
  const app = await createApp(
    testEnv({ DATABASE_URL: database.url, REGISTRATION_DAILY_LIMIT: '1000', ...overrides }),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

function client(app: NestFastifyApplication) {
  const post = (
    path: string,
    {
      payload,
      token,
      address = nextAddress(),
      origin = TEST_APP_ORIGIN,
    }: {
      payload?: object;
      token?: string;
      address?: string;
      origin?: string | null;
    } = {},
  ) =>
    app.inject({
      method: 'POST',
      url: `/api/auth/${path}`,
      remoteAddress: address,
      headers: {
        ...(origin === null ? {} : { origin }),
        ...(token === undefined ? {} : { cookie: `${COOKIE}=${token}` }),
      },
      ...(payload === undefined ? {} : { payload }),
    });

  return {
    register: (username: string, options: { address?: string; timezone?: string } = {}) =>
      post('register', {
        payload: { username, password: PASSWORD, timezone: options.timezone ?? 'UTC' },
        ...(options.address === undefined ? {} : { address: options.address }),
      }),
    login: (
      username: string,
      password = PASSWORD,
      options: { address?: string; token?: string } = {},
    ) => post('login', { payload: { username, password }, ...options }),
    logout: (token?: string) => post('logout', token === undefined ? {} : { token }),
    me: (token?: string) =>
      app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: token === undefined ? {} : { cookie: `${COOKIE}=${token}` },
      }),
    post,
  };
}

function sessionCookie(response: LightMyRequestResponse) {
  return response.cookies.find((cookie) => cookie.name === COOKIE);
}

function tokenOf(response: LightMyRequestResponse): string {
  const value = sessionCookie(response)?.value;
  expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  return value ?? '';
}

describe.runIf(TEST_DATABASE_URL !== undefined)('authentication (TEST_DATABASE_URL)', () => {
  let database: TestDatabase;
  let app: NestFastifyApplication;
  let api: ReturnType<typeof client>;

  const query = <T>(sql: string, parameters: unknown[] = []) =>
    database.dataSource.query<T>(sql, parameters);

  /** Registers a user and returns the session token. */
  const registered = async (username = nextUsername()) => {
    const response = await api.register(username);
    expect(response.statusCode).toBe(201);
    return tokenOf(response);
  };

  beforeAll(async () => {
    database = await createTestDatabase(TEST_DATABASE_URL ?? '');
    app = await startApp(database);
    api = client(app);
  });

  afterAll(async () => {
    await app.close();
    await database.drop();
  });

  describe('sessions', () => {
    it('registers, signs in with the cookie, and signs out', async () => {
      const username = nextUsername('Alice');
      const registration = await api.register(username, { timezone: 'asia/tokyo' });
      expect(registration.statusCode).toBe(201);
      const { user } = AuthResponseSchema.parse(registration.json());
      expect(user).toMatchObject({ username, timezone: 'Asia/Tokyo', locale: 'en' });

      const cookie = sessionCookie(registration);
      expect(cookie).toMatchObject({
        httpOnly: true,
        sameSite: 'Lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      });
      expect(cookie?.secure).toBeUndefined();
      const token = tokenOf(registration);

      const me = await api.me(token);
      expect(me.statusCode).toBe(200);
      expect(AuthResponseSchema.parse(me.json())).toEqual({ user });

      const logout = await api.logout(token);
      expect(logout.statusCode).toBe(204);
      expect(sessionCookie(logout)).toMatchObject({ value: '', path: '/' });
      expect((await api.me(token)).statusCode).toBe(401);
    });

    it('stores only the SHA-256 of the session token', async () => {
      const token = await registered();
      const rows = await query<{ id: string }[]>(
        'SELECT id FROM auth_sessions WHERE id = $1 OR id = $2',
        [token, hashSessionToken(token)],
      );
      expect(rows).toEqual([{ id: hashSessionToken(token) }]);
    });

    it('requires a session for GET /api/auth/me and clears a stale cookie', async () => {
      const anonymous = await api.me();
      expect(anonymous.statusCode).toBe(401);
      expect(ApiErrorSchema.parse(anonymous.json()).message).toBe('authentication required');

      const stale = await api.me('A'.repeat(43));
      expect(stale.statusCode).toBe(401);
      expect(sessionCookie(stale)?.value).toBe('');
    });

    it('replaces a presented session on sign-in', async () => {
      const username = nextUsername();
      const first = tokenOf(await api.register(username));
      const login = await api.login(username, PASSWORD, { token: first });
      expect(login.statusCode).toBe(200);
      const second = tokenOf(login);
      expect(second).not.toBe(first);
      expect((await api.me(first)).statusCode).toBe(401);
      expect((await api.me(second)).statusCode).toBe(200);
    });

    it('keeps only the ten newest sessions of a user', async () => {
      const username = nextUsername();
      await registered(username);
      const address = nextAddress();
      const tokens: string[] = [];
      for (let login = 0; login < 11; login += 1) {
        tokens.push(tokenOf(await api.login(username, PASSWORD, { address })));
      }
      const [{ count } = { count: '' }] = await query<{ count: string }[]>(
        'SELECT count(*) FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE u.username = $1',
        [username],
      );
      expect(count).toBe('10');
      expect((await api.me(tokens.at(-1))).statusCode).toBe(200);
    });

    it('ends a session 7 days after its last use, judged on the database clock', async () => {
      const token = await registered();
      const setLastSeen = (offset: string) =>
        query(`UPDATE auth_sessions SET last_seen_at = now() - $2::interval WHERE id = $1`, [
          hashSessionToken(token),
          offset,
        ]);
      await setLastSeen('6 days 23 hours 59 minutes');
      expect((await api.me(token)).statusCode).toBe(200);
      await setLastSeen('7 days 1 minute');
      expect((await api.me(token)).statusCode).toBe(401);
    });

    it('ends a session 30 days after sign-in even when it is used every day', async () => {
      const token = await registered();
      const setAge = (created: string, expires: string) =>
        query(
          `UPDATE auth_sessions
           SET created_at = now() - $2::interval, last_seen_at = now(), expires_at = now() + $3::interval
           WHERE id = $1`,
          [hashSessionToken(token), created, expires],
        );
      await setAge('29 days 23 hours 59 minutes', '1 minute');
      expect((await api.me(token)).statusCode).toBe(200);
      await setAge('30 days 1 minute', '-1 minute');
      expect((await api.me(token)).statusCode).toBe(401);
    });

    it('refreshes last_seen_at at most once an hour', async () => {
      const token = await registered();
      const id = hashSessionToken(token);
      await query(
        `UPDATE auth_sessions SET last_seen_at = now() - interval '30 minutes' WHERE id = $1`,
        [id],
      );
      const [before] = await query<{ last_seen_at: Date }[]>(
        'SELECT last_seen_at FROM auth_sessions WHERE id = $1',
        [id],
      );
      expect((await api.me(token)).statusCode).toBe(200);
      const [unchanged] = await query<{ last_seen_at: Date }[]>(
        'SELECT last_seen_at FROM auth_sessions WHERE id = $1',
        [id],
      );
      expect(unchanged?.last_seen_at).toEqual(before?.last_seen_at);

      await query(
        `UPDATE auth_sessions SET last_seen_at = now() - interval '2 hours' WHERE id = $1`,
        [id],
      );
      expect((await api.me(token)).statusCode).toBe(200);
      const [fresh] = await query<{ recent: boolean }[]>(
        `SELECT last_seen_at > now() - interval '1 minute' AS recent FROM auth_sessions WHERE id = $1`,
        [id],
      );
      expect(fresh?.recent).toBe(true);
    });

    it('deletes expired and idle sessions in bulk', async () => {
      const sessions = app.get(SessionsRepository);
      // Clear whatever earlier tests left behind, so the count below is only about these three.
      await sessions.deleteExpired();
      const active = hashSessionToken(await registered());
      const idle = hashSessionToken(await registered());
      const expired = hashSessionToken(await registered());
      await query(
        `UPDATE auth_sessions SET last_seen_at = now() - interval '8 days' WHERE id = $1`,
        [idle],
      );
      await query(
        `UPDATE auth_sessions SET created_at = now() - interval '31 days', expires_at = now() - interval '1 day'
         WHERE id = $1`,
        [expired],
      );
      // Exactly the two above: the count comes from the rows the statement returned.
      expect(await sessions.deleteExpired()).toBe(2);
      const ids = (await query<{ id: string }[]>('SELECT id FROM auth_sessions')).map(
        (row) => row.id,
      );
      expect(ids).toContain(active);
      expect(ids).not.toContain(idle);
      expect(ids).not.toContain(expired);
    });
  });

  describe('registration and sign-in', () => {
    it('refuses a username taken in any letter case with 409', async () => {
      const username = nextUsername('Bob');
      await registered(username);
      const duplicate = await api.register(username.toLowerCase());
      expect(duplicate.statusCode).toBe(409);
      expect(ApiErrorSchema.parse(duplicate.json()).message).toBe('username is taken');
    });

    it('answers an invalid registration with 400 without echoing the password', async () => {
      const response = await api.post('register', {
        payload: { username: 'x', password: 'tiny-secret' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.body).not.toContain('tiny-secret');
    });

    it('answers an unknown username and a wrong password identically', async () => {
      const username = nextUsername();
      await registered(username);
      const wrongPassword = await api.login(username, 'not the right password');
      const unknownUser = await api.login(nextUsername('nobody'), PASSWORD);
      expect(wrongPassword.statusCode).toBe(401);
      expect(unknownUser.statusCode).toBe(401);
      expect(wrongPassword.body).toBe(unknownUser.body);
      expect(sessionCookie(wrongPassword)).toBeUndefined();
    });

    it('spends a password verification on an unknown username', async () => {
      const hasher = app.get(PasswordHasher);
      const unknown = vi.spyOn(hasher, 'verifyUnknownUser');
      const hashing = vi.spyOn(hasher, 'hash');
      try {
        expect((await api.login(nextUsername('nobody'), PASSWORD)).statusCode).toBe(401);
        expect(unknown).toHaveBeenCalledTimes(1);
        expect(hashing).not.toHaveBeenCalled();
      } finally {
        unknown.mockRestore();
        hashing.mockRestore();
      }
    });

    it('signs in regardless of username letter case', async () => {
      const username = nextUsername('Carol');
      await registered(username);
      const login = await api.login(username.toUpperCase());
      expect(login.statusCode).toBe(200);
      expect(AuthResponseSchema.parse(login.json()).user.username).toBe(username);
    });

    it('upgrades a hash made with older parameters on sign-in', async () => {
      const username = nextUsername();
      await registered(username);
      const weaker = await hash(PASSWORD, {
        ...PASSWORD_HASH_OPTIONS,
        timeCost: 1,
        secret: Buffer.from(TEST_PASSWORD_PEPPER, 'base64'),
      });
      await query('UPDATE users SET password_hash = $1 WHERE username = $2', [weaker, username]);
      expect((await api.login(username)).statusCode).toBe(200);
      const [row] = await query<{ password_hash: string }[]>(
        'SELECT password_hash FROM users WHERE username = $1',
        [username],
      );
      expect(row?.password_hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    });

    it('refuses sign-in from another origin before checking anything', async () => {
      const username = nextUsername();
      await registered(username);
      const response = await api.post('login', {
        payload: { username, password: PASSWORD },
        origin: 'https://evil.example',
      });
      expect(response.statusCode).toBe(403);
      expect(
        (await api.post('login', { payload: { username, password: PASSWORD }, origin: null }))
          .statusCode,
      ).toBe(403);
    });

    it('refuses auth bodies over 16 KB with 413', async () => {
      const response = await api.post('login', {
        payload: { username: 'someone', password: 'x'.repeat(17 * 1024) },
      });
      expect(response.statusCode).toBe(413);
    });
  });

  describe('rate limits', () => {
    it('allows 20 sign-in attempts per address in 15 minutes', async () => {
      const address = nextAddress();
      for (let attempt = 0; attempt < 20; attempt += 1) {
        expect((await api.login(nextUsername('nobody'), PASSWORD, { address })).statusCode).toBe(
          401,
        );
      }
      const refused = await api.login(nextUsername('nobody'), PASSWORD, { address });
      expect(refused.statusCode).toBe(429);
      expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
      expect((await api.login(nextUsername('nobody'), PASSWORD)).statusCode).toBe(401);
    });

    it('backs off an account after five failures, even for the right password', async () => {
      const username = nextUsername();
      await registered(username);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect((await api.login(username, 'not the right password')).statusCode).toBe(401);
      }
      const refused = await api.login(username.toUpperCase(), PASSWORD);
      expect(refused.statusCode).toBe(429);
      expect(refused.headers['retry-after']).toBe('1');
    });

    it('backs off an unknown username the same way, so 429 does not reveal existence', async () => {
      const username = nextUsername('ghost');
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect((await api.login(username, PASSWORD)).statusCode).toBe(401);
      }
      expect((await api.login(username, PASSWORD)).statusCode).toBe(429);
    });

    it('allows 5 registration attempts per address per hour', async () => {
      const address = nextAddress();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect((await api.register(nextUsername(), { address })).statusCode).toBe(201);
      }
      expect((await api.register(nextUsername(), { address })).statusCode).toBe(429);
    });

    it('caps accounts created across all addresses by REGISTRATION_DAILY_LIMIT', async () => {
      const limited = await startApp(database, { REGISTRATION_DAILY_LIMIT: '2' });
      try {
        const limitedApi = client(limited);
        const taken = nextUsername();
        expect((await limitedApi.register(taken)).statusCode).toBe(201);
        // A refused registration does not use up the daily allowance.
        expect((await limitedApi.register(taken)).statusCode).toBe(409);
        expect((await limitedApi.register(nextUsername())).statusCode).toBe(201);
        const refused = await limitedApi.register(nextUsername());
        expect(refused.statusCode).toBe(429);
        expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
      } finally {
        await limited.close();
      }
    });
  });
});
