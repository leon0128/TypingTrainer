import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AuthResponseSchema, StartSessionResponseSchema } from '@typing-trainer/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { IssuedRunsRepository } from '../src/modules/play/issued-runs.repository';
import { TEST_APP_ORIGIN, testEnv } from './support/env';
import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

const PASSWORD = 'correct horse battery staple';
const COOKIE = 'tt_session';

let counter = 0;
const nextUsername = () => `leaver${String((counter += 1))}`;
let addressCounter = 0;
const nextAddress = () => `203.0.113.${String((addressCounter += 1) % 250)}`;

interface Account {
  readonly id: string;
  readonly username: string;
  readonly token: string;
}

interface ForeignKey {
  readonly table: string;
  readonly column: string;
  readonly onDelete: string;
}

describe.runIf(TEST_DATABASE_URL !== undefined)('DELETE /api/auth/me (TEST_DATABASE_URL)', () => {
  let database: TestDatabase;
  let app: NestFastifyApplication;

  const query = <T>(sql: string, parameters: unknown[] = []) =>
    database.dataSource.query<T>(sql, parameters);

  const headers = (token?: string) => ({
    origin: TEST_APP_ORIGIN,
    ...(token === undefined ? {} : { cookie: `${COOKIE}=${token}` }),
  });

  async function register(): Promise<Account> {
    const username = nextUsername();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      remoteAddress: nextAddress(),
      headers: headers(),
      payload: { username, password: PASSWORD, timezone: 'Asia/Tokyo' },
    });
    expect(response.statusCode).toBe(201);
    return {
      id: AuthResponseSchema.parse(response.json()).user.id,
      username,
      token: response.cookies.find((cookie) => cookie.name === COOKIE)?.value ?? '',
    };
  }

  async function signInAgain(username: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: nextAddress(),
      headers: headers(),
      payload: { username, password: PASSWORD },
    });
    expect(response.statusCode).toBe(200);
    return response.cookies.find((cookie) => cookie.name === COOKIE)?.value ?? '';
  }

  const remove = (token: string | undefined, payload: unknown = { password: PASSWORD }) =>
    app.inject({
      method: 'DELETE',
      url: '/api/auth/me',
      headers: headers(token),
      payload: payload as Record<string, unknown>,
    });

  const me = (token: string) =>
    app.inject({ method: 'GET', url: '/api/auth/me', headers: headers(token) });

  /** Gives an account a row in every table that refers to users, however it got there. */
  async function populate(account: Account): Promise<string> {
    const second = await signInAgain(account.username);
    await app.inject({
      method: 'PUT',
      url: '/api/preferences',
      headers: headers(account.token),
      payload: { theme: 'dark', play: { track: 'code', fontSize: 20 } },
    });
    await app.inject({
      method: 'POST',
      url: '/api/play/sessions',
      headers: headers(account.token),
      payload: { language: 'python' },
    });
    // A vs CPU run is rated, which gives the account a row in language_ratings.
    await app.inject({
      method: 'POST',
      url: '/api/play/sessions',
      headers: headers(account.token),
      payload: { language: 'python', mode: 'cpu', cpuLevel: 5 },
    });
    const [language] = await query<{ id: number }[]>(
      "SELECT id FROM languages WHERE slug = 'python'",
    );
    await query(
      `INSERT INTO play_sessions (
         user_id, mode, language_id, duration_sec, started_at, timezone, local_date,
         local_week_start, raw_keystrokes, effective_keystrokes, miss_count, kpm, accuracy, score,
         rng_seed, content_revision, app_version)
       VALUES ($1, 'single', $2, 120, now(), 'Asia/Tokyo', '2026-09-16', '2026-09-13', 100, 100, 0,
               50, 1, 50, 1, $3, 'dev')`,
      [account.id, language?.id, 'a'.repeat(64)],
    );
    return second;
  }

  /** Every foreign key in the database that points at `users`, from the catalog. */
  const keysToUsers = () =>
    query<{ table: string; column: string; delete_rule: string }[]>(
      `SELECT c.conrelid::regclass::text AS "table", a.attname AS "column", c.confdeltype AS delete_rule
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
       WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass
       ORDER BY 1, 2`,
    ).then((rows): ForeignKey[] =>
      rows.map((row) => ({ table: row.table, column: row.column, onDelete: row.delete_rule })),
    );

  async function rowsOf(userId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const key of await keysToUsers()) {
      const [row] = await query<{ n: string }[]>(
        `SELECT count(*) AS n FROM "${key.table}" WHERE "${key.column}" = $1`,
        [userId],
      );
      counts[key.table] = Number(row?.n);
    }
    return counts;
  }

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

  it('erases the account and every row that refers to it, and nothing of anyone else’s', async () => {
    const leaver = await register();
    const stayer = await register();
    await populate(leaver);
    await populate(stayer);

    const before = { leaver: await rowsOf(leaver.id), stayer: await rowsOf(stayer.id) };
    // Every table that refers to a user has something of theirs, or this test proves nothing about
    // it: a table added later fails here until the test fills it.
    for (const [table, count] of Object.entries(before.leaver)) {
      expect(count, `${table} has a row for the account being erased`).toBeGreaterThan(0);
    }
    expect(Object.keys(before.leaver).sort()).toEqual([
      'auth_sessions',
      'issued_runs',
      'language_ratings',
      'play_sessions',
      'user_play_appearance',
      'user_preferences',
    ]);

    const response = await remove(leaver.token);
    expect(response.statusCode).toBe(204);

    const after = { leaver: await rowsOf(leaver.id), stayer: await rowsOf(stayer.id) };
    for (const [table, count] of Object.entries(after.leaver)) {
      expect(count, `${table} still has rows for the erased account`).toBe(0);
    }
    expect(after.stayer).toEqual(before.stayer);
    const [user] = await query<{ n: string }[]>('SELECT count(*) AS n FROM users WHERE id = $1', [
      leaver.id,
    ]);
    expect(user?.n).toBe('0');
    expect((await me(stayer.token)).statusCode).toBe(200);
  });

  it('is complete by construction: every table that refers to a user cascades on delete', async () => {
    const keys = await keysToUsers();
    expect(keys.length).toBeGreaterThanOrEqual(5);
    // `c` is CASCADE in pg_constraint.confdeltype.
    expect(keys.filter((key) => key.onDelete !== 'c')).toEqual([]);
  });

  it('ends every session of the account, clears the cookie, and refuses the old credentials', async () => {
    const leaver = await register();
    const other = await populate(leaver);

    const response = await remove(leaver.token);
    expect(response.statusCode).toBe(204);
    expect(response.cookies.find((cookie) => cookie.name === COOKIE)?.value).toBe('');

    expect((await me(leaver.token)).statusCode).toBe(401);
    // A session on another device ended with it.
    expect((await me(other)).statusCode).toBe(401);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: nextAddress(),
      headers: headers(),
      payload: { username: leaver.username, password: PASSWORD },
    });
    expect(login.statusCode).toBe(401);
  });

  it('frees the username, and a new account under it starts empty', async () => {
    const leaver = await register();
    await populate(leaver);
    await remove(leaver.token);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      remoteAddress: nextAddress(),
      headers: headers(),
      payload: { username: leaver.username, password: PASSWORD, timezone: 'UTC' },
    });
    expect(response.statusCode).toBe(201);
    const again = AuthResponseSchema.parse(response.json()).user;
    expect(again.id).not.toBe(leaver.id);

    const token = response.cookies.find((cookie) => cookie.name === COOKIE)?.value ?? '';
    const history = await app.inject({
      method: 'GET',
      url: '/api/history',
      headers: headers(token),
    });
    expect(history.json<{ total: number }>().total).toBe(0);
    const rankings = await app.inject({
      method: 'GET',
      url: '/api/ghost-records',
      headers: headers(token),
    });
    expect(
      rankings
        .json<{ languages: { total: number | null }[] }>()
        .languages.every((entry) => entry.total === null),
    ).toBe(true);
  });

  it('refuses a wrong password with 403, erases nothing, and leaves the session alone', async () => {
    const account = await register();
    await populate(account);
    const before = await rowsOf(account.id);

    const response = await remove(account.token, { password: 'not the password' });
    // Never 401: the client reads that as "your session ended" and would sign the person out.
    expect(response.statusCode).toBe(403);
    expect(response.json<{ message: string }>().message).toBe('incorrect password');
    expect(await rowsOf(account.id)).toEqual(before);
    expect((await me(account.token)).statusCode).toBe(200);
  });

  it.each([
    ['no body at all', undefined],
    ['no password', {}],
    ['an empty password', { password: '' }],
    ['a password that is not text', { password: 12345678 }],
    ['a password of absurd length', { password: 'x'.repeat(600) }],
  ])('refuses %s with 400, and erases nothing', async (_name, payload) => {
    const account = await register();
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/auth/me',
      headers: headers(account.token),
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });
    expect(response.statusCode).toBe(400);
    expect((await me(account.token)).statusCode).toBe(200);
  });

  it('shares the sign-in backoff, so an open session cannot be used to guess the password', async () => {
    const account = await register();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        (await remove(account.token, { password: `wrong ${String(attempt)}` })).statusCode,
      ).toBe(403);
    }

    // Blocked now, even with the right password.
    const blocked = await remove(account.token);
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect((await me(account.token)).statusCode).toBe(200);

    // And it is the same block sign-in is under: they count one account's failures together.
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: nextAddress(),
      headers: headers(),
      payload: { username: account.username, password: PASSWORD },
    });
    expect(login.statusCode).toBe(429);
  });

  it('requires a session, and refuses another origin before reading anything', async () => {
    expect((await remove(undefined)).statusCode).toBe(401);

    const account = await register();
    const foreign = await app.inject({
      method: 'DELETE',
      url: '/api/auth/me',
      headers: { origin: 'https://evil.example', cookie: `${COOKIE}=${account.token}` },
      payload: { password: PASSWORD },
    });
    expect(foreign.statusCode).toBe(403);
    expect((await me(account.token)).statusCode).toBe(200);
  });

  it('answers 401 to the run of an account that is gone, instead of failing', async () => {
    const account = await register();
    const start = await app.inject({
      method: 'POST',
      url: '/api/play/sessions',
      headers: headers(account.token),
      payload: { language: 'python' },
    });
    const run = StartSessionResponseSchema.parse(start.json());
    await remove(account.token);

    const submit = await app.inject({
      method: 'POST',
      url: `/api/play/sessions/${run.sessionId}/result`,
      headers: headers(account.token),
      payload: { log: { keys: 'a', deltas: [0] } },
    });
    expect(submit.statusCode).toBe(401);
  });

  it('stores nothing for an account erased between a run being consumed and stored', async () => {
    const account = await register();
    const [language] = await query<{ id: number }[]>(
      "SELECT id FROM languages WHERE slug = 'python'",
    );
    await remove(account.token);

    const stored = await app.get(IssuedRunsRepository).storeRun({
      userId: account.id,
      languageId: language?.id ?? 0,
      mode: 'single',
      cpuLevel: null,
      ghostPeriod: null,
      opponentScore: null,
      result: null,
      durationSec: 120,
      issuedAt: new Date(),
      submittedAt: new Date(),
      runTimeMs: 1000,
      rawKeystrokes: 1,
      effectiveKeystrokes: 1,
      missCount: 0,
      kpm: 1,
      accuracy: 1,
      score: 1,
      rngSeed: '1',
      contentRevision: 'a'.repeat(64),
      appVersion: 'dev',
    });
    expect(stored).toBeUndefined();
  });
});
