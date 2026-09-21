import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ActivityResponseSchema, AuthResponseSchema } from '@typing-trainer/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { TEST_APP_ORIGIN, testEnv } from './support/env';
import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

const PASSWORD = 'correct horse battery staple';
const COOKIE = 'tt_session';
/**
 * A time zone whose date is not UTC's date right now, so a mix-up between them shows whatever the
 * time of day: Kiritimati (UTC+14) is a day ahead from 10:00 UTC, Pago Pago (UTC-11) a day behind
 * until 11:00 UTC.
 */
const ZONE = new Date().getUTCHours() >= 10 ? 'Pacific/Kiritimati' : 'Pacific/Pago_Pago';

const addDays = (date: string, delta: number): string => {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + delta);
  return moved.toISOString().slice(0, 10);
};
/** Today in a time zone, from the clock of this process and not from the database. */
const todayIn = (zone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());
const TODAY = todayIn(ZONE);
const UTC_TODAY = new Date().toISOString().slice(0, 10);

let counter = 0;

describe.runIf(TEST_DATABASE_URL !== undefined)('GET /api/activity (TEST_DATABASE_URL)', () => {
  let database: TestDatabase;
  let app: NestFastifyApplication;
  let token = '';
  let userId = '';
  let otherId = '';

  const query = <T>(sql: string, parameters: unknown[] = []) =>
    database.dataSource.query<T>(sql, parameters);

  async function register(): Promise<{ token: string; id: string }> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      remoteAddress: `198.18.0.${String((counter += 1))}`,
      headers: { origin: TEST_APP_ORIGIN },
      payload: { username: `active${String(counter)}`, password: PASSWORD },
    });
    expect(response.statusCode).toBe(201);
    return {
      token: response.cookies.find((cookie) => cookie.name === COOKIE)?.value ?? '',
      id: AuthResponseSchema.parse(response.json()).user.id,
    };
  }

  /** A stored run on a local date, in a pool, straight into the table. */
  async function insertRun(user: string, localDate: string, slug: string): Promise<string> {
    const weekday = new Date(`${localDate}T00:00:00Z`).getUTCDay();
    const [row] = await query<{ id: string }[]>(
      `INSERT INTO play_sessions (user_id, mode, language_id, started_at, timezone, local_date,
         local_week_start, raw_keystrokes, effective_keystrokes, miss_count, kpm, accuracy, score,
         rng_seed, content_revision, app_version)
       SELECT $1, 'single', id, $2::timestamptz, $3, $4::date, $5::date, 10, 10, 0, 5, 1, 5, 1, 'rev', '0'
       FROM languages WHERE slug = $6
       RETURNING id`,
      [user, `${localDate}T06:00:00Z`, ZONE, localDate, addDays(localDate, -weekday), slug],
    );
    return row?.id ?? '';
  }

  const activity = (search = '', cookie = token) =>
    app.inject({
      method: 'GET',
      url: `/api/activity${search}`,
      headers: { cookie: `${COOKIE}=${cookie}` },
    });
  const read = async (search = '') => {
    const response = await activity(search);
    expect(response.statusCode).toBe(200);
    return ActivityResponseSchema.parse(response.json());
  };
  const clear = () => query('DELETE FROM play_sessions');

  beforeAll(async () => {
    database = await createTestDatabase(TEST_DATABASE_URL ?? '');
    app = await createApp(testEnv({ DATABASE_URL: database.url, REGISTRATION_DAILY_LIMIT: '500' }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    ({ token, id: userId } = await register());
    ({ id: otherId } = await register());
    await query(`UPDATE users SET timezone = $2 WHERE id = $1`, [userId, ZONE]);
  });

  afterAll(async () => {
    await app.close();
    await database.drop();
  });

  it('is tested in a zone whose today is not the UTC today', () => {
    expect(TODAY).not.toBe(UTC_TODAY);
  });

  it('needs a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/activity' });
    expect(response.statusCode).toBe(401);
  });

  it('has, with nothing played, the last 365 days up to today in the profile time zone', async () => {
    await clear();
    const result = await read();
    expect(result).toEqual({ from: addDays(TODAY, -364), to: TODAY, days: [] });
  });

  it('adds up the runs of a day in the programming languages and in the natural-language pools', async () => {
    await clear();
    const day = addDays(TODAY, -40);
    const other = addDays(TODAY, -10);
    for (const slug of ['python', 'go', 'en-word', 'ja-line']) await insertRun(userId, day, slug);
    await insertRun(userId, other, 'typescript');
    await insertRun(userId, TODAY, 'en-paragraph');
    const { days } = await read();
    expect(days).toEqual([
      { date: day, code: 2, natural: 2 },
      { date: other, code: 1, natural: 0 },
      { date: TODAY, code: 0, natural: 1 },
    ]);
  });

  it('lists the days oldest first, and not the ones without a run', async () => {
    await clear();
    const dates = [addDays(TODAY, -3), addDays(TODAY, -200), addDays(TODAY, -50)];
    for (const date of dates) await insertRun(userId, date, 'python');
    const { days } = await read();
    expect(days.map((day) => day.date)).toEqual([...dates].sort());
  });

  it('counts a Japanese run for an account whose display language is not Japanese, naming no pool', async () => {
    await clear();
    await insertRun(userId, addDays(TODAY, -5), 'ja-word');
    const { days } = await read();
    expect(days).toEqual([{ date: addDays(TODAY, -5), code: 0, natural: 1 }]);
  });

  it('reads 365 days by default: the 365th day back is in, the one before it is not', async () => {
    await clear();
    await insertRun(userId, addDays(TODAY, -364), 'python');
    await insertRun(userId, addDays(TODAY, -365), 'python');
    await insertRun(userId, addDays(TODAY, -400), 'python');
    const { from, days } = await read();
    expect(from).toBe(addDays(TODAY, -364));
    expect(days.map((day) => day.date)).toEqual([addDays(TODAY, -364)]);
  });

  it('reads a range from one date to another, both included', async () => {
    await clear();
    const from = addDays(TODAY, -60);
    const to = addDays(TODAY, -50);
    for (const date of [addDays(from, -1), from, addDays(from, 4), to, addDays(to, 1)]) {
      await insertRun(userId, date, 'python');
    }
    const result = await read(`?from=${from}&to=${to}`);
    expect(result.from).toBe(from);
    expect(result.to).toBe(to);
    expect(result.days.map((day) => day.date)).toEqual([from, addDays(from, 4), to]);
  });

  it('reads the 365 days that end at `to`, or start at `from`, when only one is given', async () => {
    await clear();
    const anchor = addDays(TODAY, -100);
    const result = await read(`?to=${anchor}`);
    expect(result).toEqual({ from: addDays(anchor, -364), to: anchor, days: [] });
    const forward = await read(`?from=${anchor}`);
    expect(forward).toEqual({ from: anchor, to: addDays(anchor, 364), days: [] });
  });

  it("is the signed-in account's own runs only", async () => {
    await clear();
    await insertRun(userId, addDays(TODAY, -2), 'python');
    await insertRun(otherId, addDays(TODAY, -2), 'python');
    await insertRun(otherId, addDays(TODAY, -3), 'python');
    const { days } = await read();
    expect(days).toEqual([{ date: addDays(TODAY, -2), code: 1, natural: 0 }]);
  });

  it('follows a deletion on the next reading', async () => {
    await clear();
    const run = await insertRun(userId, addDays(TODAY, -7), 'python');
    await insertRun(userId, addDays(TODAY, -7), 'go');
    expect((await read()).days).toEqual([{ date: addDays(TODAY, -7), code: 2, natural: 0 }]);
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/history/${run}`,
      headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${token}` },
    });
    expect(deleted.statusCode).toBe(204);
    expect((await read()).days).toEqual([{ date: addDays(TODAY, -7), code: 1, natural: 0 }]);
  });

  it.each([
    ['a range that ends before it starts', '?from=2026-03-02&to=2026-03-01'],
    ['a range of more than 366 days', '?from=2025-01-01&to=2026-01-02'],
    ['a date that does not exist', '?from=2026-02-30'],
    ['a month that does not exist', '?from=2026-13-01'],
    ['a date in another shape', '?to=03/04/2026'],
  ])('refuses %s with 400', async (_what, search) => {
    const response = await activity(search);
    expect(response.statusCode).toBe(400);
  });
});
