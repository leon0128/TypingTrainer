import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AuthResponseSchema, RankingsResponseSchema } from '@typing-trainer/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { TEST_APP_ORIGIN, testEnv } from './support/env';
import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

const PASSWORD = 'correct horse battery staple';
const COOKIE = 'tt_session';

let counter = 0;
const nextUsername = () => `ranker${String((counter += 1))}`;
let addressCounter = 0;
const nextAddress = () => `203.0.113.${String((addressCounter += 1))}`;

/** UTC-today as an ISO date; the ranking query computes "today" from the database clock too. */
const today = (): string => new Date().toISOString().slice(0, 10);
const addDays = (isoDate: string, delta: number): string => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
};
/** The Sunday starting the week containing `isoDate` (UTC). */
const startOfWeek = (isoDate: string): string =>
  addDays(isoDate, -new Date(`${isoDate}T00:00:00Z`).getUTCDay());
/** "Today" in an IANA time zone, right now. */
const todayIn = (timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());

describe.runIf(TEST_DATABASE_URL !== undefined)('GET /api/rankings (TEST_DATABASE_URL)', () => {
  let database: TestDatabase;
  let app: NestFastifyApplication;
  let languageId: number;

  const query = <T>(sql: string, parameters: unknown[] = []) =>
    database.dataSource.query<T>(sql, parameters);

  /** Registers a user in the given time zone and returns their id and session token. */
  async function signedIn(timezone = 'UTC'): Promise<{ id: string; token: string }> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      remoteAddress: nextAddress(),
      headers: { origin: TEST_APP_ORIGIN },
      payload: { username: nextUsername(), password: PASSWORD, timezone },
    });
    expect(response.statusCode).toBe(201);
    const token = response.cookies.find((cookie) => cookie.name === COOKIE)?.value ?? '';
    const { user } = AuthResponseSchema.parse(response.json());
    return { id: user.id, token };
  }

  /**
   * Inserts a run directly (§9.3), bypassing play/result so the test controls `started_at`,
   * `local_date`, and `local_week_start` exactly, rather than only what "now" happens to be.
   */
  async function insertRun(row: {
    userId: string;
    startedAt: string;
    localDate: string;
    localWeekStart: string;
    score: number;
  }): Promise<void> {
    await query(
      `INSERT INTO play_sessions (
         user_id, mode, language_id, duration_sec, started_at, timezone, local_date,
         local_week_start, raw_keystrokes, effective_keystrokes, miss_count, kpm, accuracy, score,
         rng_seed, content_revision, app_version)
       VALUES ($1, 'single', $2, 120, $3, 'UTC', $4, $5, 100, 100, 0, 50, 1, $6, 1, $7, 'dev')`,
      [
        row.userId,
        languageId,
        row.startedAt,
        row.localDate,
        row.localWeekStart,
        row.score,
        'a'.repeat(64),
      ],
    );
  }

  const rankings = (token: string, period: string, language = 'python') =>
    app.inject({
      method: 'GET',
      url: `/api/rankings?period=${period}&language=${language}`,
      headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${token}` },
    });

  beforeAll(async () => {
    database = await createTestDatabase(TEST_DATABASE_URL ?? '');
    app = await createApp(testEnv({ DATABASE_URL: database.url }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const [row] = await query<{ id: number }[]>(`SELECT id FROM languages WHERE slug = 'python'`);
    languageId = row?.id ?? 0;
  });

  afterAll(async () => {
    await app.close();
    await database.drop();
  });

  it("returns only the signed-in user's own runs, never another user's", async () => {
    const me = await signedIn();
    const other = await signedIn();
    const day = today();
    const week = startOfWeek(day);
    await insertRun({
      userId: me.id,
      startedAt: `${day}T10:00:00Z`,
      localDate: day,
      localWeekStart: week,
      score: 10,
    });
    await insertRun({
      userId: other.id,
      startedAt: `${day}T10:00:00Z`,
      localDate: day,
      localWeekStart: week,
      score: 999,
    });

    const response = await rankings(me.token, 'total');
    expect(response.statusCode).toBe(200);
    const body = RankingsResponseSchema.parse(response.json());
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]?.score).toBe(10);
  });

  it('orders by score, breaking ties by the earlier run', async () => {
    const { id: userId, token } = await signedIn();
    const day = today();
    const week = startOfWeek(day);
    await insertRun({
      userId,
      startedAt: `${day}T10:00:00Z`,
      localDate: day,
      localWeekStart: week,
      score: 50,
    });
    // earlier, same score
    await insertRun({
      userId,
      startedAt: `${day}T09:00:00Z`,
      localDate: day,
      localWeekStart: week,
      score: 80,
    });
    // later, same score
    await insertRun({
      userId,
      startedAt: `${day}T11:00:00Z`,
      localDate: day,
      localWeekStart: week,
      score: 80,
    });

    const response = await rankings(token, 'total');
    const body = RankingsResponseSchema.parse(response.json());
    expect(body.entries.map((e) => e.score)).toEqual([80, 80, 50]);
    expect(body.entries[0]?.startedAt).toBe(`${day}T09:00:00.000Z`);
    expect(body.entries[1]?.startedAt).toBe(`${day}T11:00:00.000Z`);
  });

  it('caps the list at 10, keeping only the highest scores', async () => {
    const { id: userId, token } = await signedIn();
    const day = today();
    const week = startOfWeek(day);
    for (let score = 1; score <= 12; score += 1) {
      await insertRun({
        userId,
        startedAt: `${day}T${String(score).padStart(2, '0')}:00:00Z`,
        localDate: day,
        localWeekStart: week,
        score,
      });
    }
    const response = await rankings(token, 'total');
    const body = RankingsResponseSchema.parse(response.json());
    expect(body.entries).toHaveLength(10);
    expect(body.entries.map((e) => e.score)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  });

  it('excludes a run from yesterday under daily, but includes it under weekly and total', async () => {
    const { id: userId, token } = await signedIn();
    const yesterday = addDays(today(), -1);
    // Still inside the current week (Sunday-start), so weekly must include it.
    await insertRun({
      userId,
      startedAt: `${yesterday}T10:00:00Z`,
      localDate: yesterday,
      localWeekStart: startOfWeek(today()),
      score: 42,
    });

    const daily = RankingsResponseSchema.parse((await rankings(token, 'daily')).json());
    expect(daily.entries).toHaveLength(0);

    const weekly = RankingsResponseSchema.parse((await rankings(token, 'weekly')).json());
    expect(weekly.entries.map((e) => e.score)).toContain(42);

    const total = RankingsResponseSchema.parse((await rankings(token, 'total')).json());
    expect(total.entries.map((e) => e.score)).toContain(42);
  });

  it('excludes a run from last week under weekly, but includes it under total', async () => {
    const { id: userId, token } = await signedIn();
    const lastWeekStart = addDays(startOfWeek(today()), -7);
    await insertRun({
      userId,
      startedAt: `${lastWeekStart}T10:00:00Z`,
      localDate: lastWeekStart,
      localWeekStart: lastWeekStart,
      score: 77,
    });

    const weekly = RankingsResponseSchema.parse((await rankings(token, 'weekly')).json());
    expect(weekly.entries.map((e) => e.score)).not.toContain(77);

    const total = RankingsResponseSchema.parse((await rankings(token, 'total')).json());
    expect(total.entries.map((e) => e.score)).toContain(77);
  });

  it('uses the profile time zone for "today", not the server\'s or UTC', async () => {
    // UTC+14: whenever it is still "today" in UTC, it is very likely already "tomorrow" here,
    // so this profile's local date almost always differs from UTC's (§6.4).
    const timezone = 'Pacific/Kiritimati';
    const { id: userId, token } = await signedIn(timezone);
    const localToday = todayIn(timezone);
    const utcToday = today();
    if (localToday === utcToday) return; // the rare moment they coincide; nothing to prove here

    await insertRun({
      userId,
      startedAt: new Date().toISOString(),
      localDate: localToday,
      localWeekStart: startOfWeek(localToday),
      score: 99,
    });

    const daily = RankingsResponseSchema.parse((await rankings(token, 'daily')).json());
    expect(daily.entries.map((e) => e.score)).toContain(99);
  });

  it('refuses an unknown or missing language, and requires a period', async () => {
    const { token } = await signedIn();
    expect((await rankings(token, 'total', 'not-a-language')).statusCode).toBe(400);
    const missingPeriod = await app.inject({
      method: 'GET',
      url: '/api/rankings?language=python',
      headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${token}` },
    });
    expect(missingPeriod.statusCode).toBe(400);
  });

  it('refuses a language the schema knows but the server has disabled', async () => {
    const { token } = await signedIn();
    await query(`UPDATE languages SET enabled = false WHERE slug = 'go'`);
    try {
      expect((await rankings(token, 'total', 'go')).statusCode).toBe(400);
    } finally {
      await query(`UPDATE languages SET enabled = true WHERE slug = 'go'`);
    }
  });

  it('requires a session', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/rankings?period=total&language=python',
      headers: { origin: TEST_APP_ORIGIN },
    });
    expect(response.statusCode).toBe(401);
  });
});
