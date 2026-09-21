import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AuthResponseSchema, DashboardResponseSchema } from '@typing-trainer/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { TEST_APP_ORIGIN, testEnv } from './support/env';
import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

const PASSWORD = 'correct horse battery staple';
const COOKIE = 'tt_session';
// UTC+14: its "today" differs from UTC's for 14 hours of every day, so a query that used the
// server clock instead of the profile time zone would be caught for most of the day.
const ZONE = 'Pacific/Kiritimati';

let counter = 0;
const nextUsername = () => `dasher${String((counter += 1))}`;
let addressCounter = 0;
const nextAddress = () => `198.51.100.${String((addressCounter += 1))}`;

const addDays = (isoDate: string, delta: number): string => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
};
const startOfWeek = (isoDate: string): string =>
  addDays(isoDate, -new Date(`${isoDate}T00:00:00Z`).getUTCDay());
const todayIn = (timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());

describe.runIf(TEST_DATABASE_URL !== undefined)('GET /api/dashboard (TEST_DATABASE_URL)', () => {
  let database: TestDatabase;
  let app: NestFastifyApplication;
  let pythonId = 0;
  let goId = 0;

  const query = <T>(sql: string, parameters: unknown[] = []) =>
    database.dataSource.query<T>(sql, parameters);

  async function signedIn(timezone = ZONE): Promise<{ id: string; token: string }> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      remoteAddress: nextAddress(),
      headers: { origin: TEST_APP_ORIGIN },
      payload: { username: nextUsername(), password: PASSWORD, timezone },
    });
    expect(response.statusCode).toBe(201);
    const token = response.cookies.find((cookie) => cookie.name === COOKIE)?.value ?? '';
    return { id: AuthResponseSchema.parse(response.json()).user.id, token };
  }

  /** Inserts a run on a local date; the week start is derived so the row satisfies its CHECK. */
  async function insertRun(row: {
    userId: string;
    localDate: string;
    hour?: number;
    score: number;
    languageId?: number;
    keystrokes?: number;
  }): Promise<string> {
    const [inserted] = await query<{ id: string }[]>(
      `INSERT INTO play_sessions (
         user_id, mode, language_id, duration_sec, started_at, timezone, local_date,
         local_week_start, raw_keystrokes, effective_keystrokes, miss_count, kpm, accuracy, score,
         rng_seed, content_revision, app_version)
       VALUES ($1, 'single', $2, 120, $3, $4, $5, $6, $7, $7, 0, 50, 1, $8, 1, $9, 'dev')
       RETURNING id`,
      [
        row.userId,
        row.languageId ?? pythonId,
        `${row.localDate}T${String(row.hour ?? 10).padStart(2, '0')}:00:00Z`,
        ZONE,
        row.localDate,
        startOfWeek(row.localDate),
        row.keystrokes ?? 100,
        row.score,
        'a'.repeat(64),
      ],
    );
    return inserted?.id ?? '';
  }

  const dashboard = (token: string, params: string) =>
    app.inject({
      method: 'GET',
      url: `/api/dashboard?${params}`,
      headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${token}` },
    });

  beforeAll(async () => {
    database = await createTestDatabase(TEST_DATABASE_URL ?? '');
    app = await createApp(testEnv({ DATABASE_URL: database.url }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const rows = await query<{ id: number; slug: string }[]>(`SELECT id, slug FROM languages`);
    pythonId = rows.find((row) => row.slug === 'python')?.id ?? 0;
    goId = rows.find((row) => row.slug === 'go')?.id ?? 0;
  });

  afterAll(async () => {
    await app.close();
    await database.drop();
  });

  it('daily returns every run of the profile-zone today, oldest first', async () => {
    const me = await signedIn();
    const other = await signedIn();
    const today = todayIn(ZONE);
    await insertRun({ userId: me.id, localDate: today, hour: 12, score: 70 });
    await insertRun({ userId: me.id, localDate: today, hour: 9, score: 50 });
    await insertRun({ userId: me.id, localDate: addDays(today, -1), score: 999 });
    await insertRun({ userId: me.id, localDate: today, score: 5, languageId: goId });
    await insertRun({ userId: other.id, localDate: today, score: 888 });

    const response = await dashboard(me.token, 'period=daily&language=python');
    expect(response.statusCode).toBe(200);
    const body = DashboardResponseSchema.parse(response.json());
    expect(body.from).toBe(today);
    expect(body.to).toBe(today);
    expect(body.points.map((point) => point.score)).toEqual([50, 70]);
  });

  it('weekly returns seven Sunday–Saturday days with the best score per day and gaps as null', async () => {
    const me = await signedIn();
    // Wednesday of the week containing today's profile date: mid-week on purpose.
    const sunday = startOfWeek(todayIn(ZONE));
    const wednesday = addDays(sunday, 3);
    await insertRun({ userId: me.id, localDate: wednesday, hour: 8, score: 40 });
    await insertRun({ userId: me.id, localDate: wednesday, hour: 9, score: 90 });
    await insertRun({ userId: me.id, localDate: addDays(sunday, -1), score: 777 });
    await insertRun({ userId: me.id, localDate: addDays(sunday, 7), score: 666 });

    // Any date in the week selects it; ask by Friday.
    const response = await dashboard(
      me.token,
      `period=weekly&language=python&from=${addDays(sunday, 5)}`,
    );
    const body = DashboardResponseSchema.parse(response.json());
    expect(body.from).toBe(sunday);
    expect(body.to).toBe(addDays(sunday, 6));
    expect(body.points).toHaveLength(7);
    expect(body.points.map((point) => point.score)).toEqual([
      null,
      null,
      null,
      90,
      null,
      null,
      null,
    ]);
    expect(body.points[0]?.x).toBe(sunday);
  });

  it('total lists only played days, gaps collapsed, and honors from and to', async () => {
    const me = await signedIn();
    const today = todayIn(ZONE);
    const days = [addDays(today, -200), addDays(today, -40), addDays(today, -3)];
    await insertRun({ userId: me.id, localDate: days[0] ?? '', score: 10 });
    await insertRun({ userId: me.id, localDate: days[1] ?? '', score: 20 });
    await insertRun({ userId: me.id, localDate: days[1] ?? '', hour: 15, score: 35 });
    await insertRun({ userId: me.id, localDate: days[2] ?? '', score: 30 });

    const all = DashboardResponseSchema.parse(
      (await dashboard(me.token, 'period=total&language=python')).json(),
    );
    expect(all.points).toEqual([
      { x: days[0], score: 10 },
      { x: days[1], score: 35 },
      { x: days[2], score: 30 },
    ]);

    const recent = DashboardResponseSchema.parse(
      (
        await dashboard(
          me.token,
          `period=total&language=python&from=${addDays(today, -90)}&to=${addDays(today, -3)}`,
        )
      ).json(),
    );
    expect(recent.points.map((point) => point.score)).toEqual([35, 30]);
  });

  it('summarizes across all languages, independent of the selected one', async () => {
    const me = await signedIn();
    const today = todayIn(ZONE);
    await insertRun({ userId: me.id, localDate: today, score: 60, keystrokes: 200 });
    await insertRun({
      userId: me.id,
      localDate: today,
      score: 75,
      languageId: goId,
      keystrokes: 300,
    });

    const body = DashboardResponseSchema.parse(
      (await dashboard(me.token, 'period=total&language=python')).json(),
    );
    expect(body.summary.totalRuns).toBe(2);
    expect(body.summary.totalKeystrokes).toBe(500);
    expect(body.summary.bestScores).toEqual(
      expect.arrayContaining([
        { language: 'python', score: 60 },
        { language: 'go', score: 75 },
      ]),
    );
    expect(body.summary.highestCpuLevelBeaten).toBeNull();
  });

  it('reflects a deleted run on the very next request (§6.3)', async () => {
    const me = await signedIn();
    const today = todayIn(ZONE);
    await insertRun({ userId: me.id, localDate: addDays(today, -2), score: 30 });
    const best = await insertRun({ userId: me.id, localDate: addDays(today, -1), score: 95 });

    const before = DashboardResponseSchema.parse(
      (await dashboard(me.token, 'period=total&language=python')).json(),
    );
    expect(before.points.map((point) => point.score)).toEqual([30, 95]);
    expect(before.summary.totalRuns).toBe(2);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/history/${best}`,
      headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${me.token}` },
    });
    expect(deleted.statusCode).toBe(204);

    const after = DashboardResponseSchema.parse(
      (await dashboard(me.token, 'period=total&language=python')).json(),
    );
    expect(after.points.map((point) => point.score)).toEqual([30]);
    expect(after.summary.totalRuns).toBe(1);
    expect(after.summary.bestScores).toEqual([{ language: 'python', score: 30 }]);
  });

  it('rejects bad queries and requires a session', async () => {
    const me = await signedIn();
    const bad = [
      'period=daily',
      'period=weekly&language=python&to=2026-01-01',
      'period=total&language=python&from=2026-02-30',
      // A month or day out of range once threw inside the schema, which answered 500.
      'period=total&language=python&from=2026-13-01',
      'period=total&language=python&to=2026-00-10',
      'period=total&language=python&from=2026-03-02&to=2026-03-01',
      'period=daily&language=python&from=2026-01-01&to=2026-03-01',
    ];
    for (const params of bad) {
      expect((await dashboard(me.token, params)).statusCode, params).toBe(400);
    }
    const anonymous = await app.inject({
      method: 'GET',
      url: '/api/dashboard?period=total&language=python',
      headers: { origin: TEST_APP_ORIGIN },
    });
    expect(anonymous.statusCode).toBe(401);
  });
});
