import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  AuthResponseSchema,
  HistoryResponseSchema,
  RankingsResponseSchema,
} from '@typing-trainer/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { TEST_APP_ORIGIN, testEnv } from './support/env';
import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

const PASSWORD = 'correct horse battery staple';
const COOKIE = 'tt_session';

let counter = 0;
const nextUsername = () => `hist${String((counter += 1))}`;
let addressCounter = 0;
const nextAddress = () => `203.0.113.${String((addressCounter += 1))}`;

const today = (): string => new Date().toISOString().slice(0, 10);
const addDays = (isoDate: string, delta: number): string => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
};
const startOfWeek = (isoDate: string): string =>
  addDays(isoDate, -new Date(`${isoDate}T00:00:00Z`).getUTCDay());

describe.runIf(TEST_DATABASE_URL !== undefined)(
  'history and its effect on rankings (TEST_DATABASE_URL)',
  () => {
    let database: TestDatabase;
    let app: NestFastifyApplication;
    let pythonId: number;
    let goId: number;

    const query = <T>(sql: string, parameters: unknown[] = []) =>
      database.dataSource.query<T>(sql, parameters);

    async function signedIn(): Promise<{ id: string; token: string }> {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        remoteAddress: nextAddress(),
        headers: { origin: TEST_APP_ORIGIN },
        payload: { username: nextUsername(), password: PASSWORD },
      });
      expect(response.statusCode).toBe(201);
      const token = response.cookies.find((cookie) => cookie.name === COOKIE)?.value ?? '';
      const { user } = AuthResponseSchema.parse(response.json());
      return { id: user.id, token };
    }

    async function insertRun(row: {
      userId: string;
      languageId: number;
      startedAt: string;
      localDate: string;
      localWeekStart: string;
      score: number;
      mode?: string;
    }): Promise<string> {
      const [inserted] = await query<{ id: string }[]>(
        `INSERT INTO play_sessions (
         user_id, mode, language_id, duration_sec, started_at, timezone, local_date,
         local_week_start, raw_keystrokes, effective_keystrokes, miss_count, kpm, accuracy, score,
         rng_seed, content_revision, app_version)
       VALUES ($1, $8, $2, 120, $3, 'UTC', $4, $5, 100, 100, 0, 50, 1, $6, 1, $7, 'dev')
       RETURNING id`,
        [
          row.userId,
          row.languageId,
          row.startedAt,
          row.localDate,
          row.localWeekStart,
          row.score,
          'a'.repeat(64),
          row.mode ?? 'single',
        ],
      );
      return inserted?.id ?? '';
    }

    const history = (token: string, qs = '') =>
      app.inject({
        method: 'GET',
        url: `/api/history${qs}`,
        headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${token}` },
      });

    const deleteRun = (token: string, id: string) =>
      app.inject({
        method: 'DELETE',
        url: `/api/history/${id}`,
        headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${token}` },
      });

    const rankings = (token: string, period: string, language: string) =>
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
      const rows = await query<{ id: number; slug: string }[]>(
        `SELECT id, slug FROM languages WHERE slug IN ('python', 'go')`,
      );
      pythonId = rows.find((r) => r.slug === 'python')?.id ?? 0;
      goId = rows.find((r) => r.slug === 'go')?.id ?? 0;
    });

    afterAll(async () => {
      await app.close();
      await database.drop();
    });

    describe('GET /api/history', () => {
      it("lists only the signed-in user's own runs, newest first", async () => {
        const me = await signedIn();
        const other = await signedIn();
        const day = today();
        const week = startOfWeek(day);
        await insertRun({
          userId: me.id,
          languageId: pythonId,
          startedAt: `${day}T09:00:00Z`,
          localDate: day,
          localWeekStart: week,
          score: 10,
        });
        await insertRun({
          userId: me.id,
          languageId: pythonId,
          startedAt: `${day}T10:00:00Z`,
          localDate: day,
          localWeekStart: week,
          score: 20,
        });
        await insertRun({
          userId: other.id,
          languageId: pythonId,
          startedAt: `${day}T10:00:00Z`,
          localDate: day,
          localWeekStart: week,
          score: 999,
        });

        const response = await history(me.token);
        expect(response.statusCode).toBe(200);
        const body = HistoryResponseSchema.parse(response.json());
        expect(body.total).toBe(2);
        expect(body.entries.map((e) => e.score)).toEqual([20, 10]);
      });

      it('filters by language and by mode', async () => {
        const { id: userId, token } = await signedIn();
        const day = today();
        const week = startOfWeek(day);
        await insertRun({
          userId,
          languageId: pythonId,
          startedAt: `${day}T09:00:00Z`,
          localDate: day,
          localWeekStart: week,
          score: 1,
        });
        await insertRun({
          userId,
          languageId: goId,
          startedAt: `${day}T09:00:00Z`,
          localDate: day,
          localWeekStart: week,
          score: 2,
        });

        const pythonOnly = HistoryResponseSchema.parse(
          (await history(token, '?language=go')).json(),
        );
        expect(pythonOnly.entries.map((e) => e.language)).toEqual(['go']);

        // P1 supports only 'single' play (§4.2); the filter still narrows correctly by it.
        const singleOnly = HistoryResponseSchema.parse(
          (await history(token, '?mode=single')).json(),
        );
        expect(singleOnly.total).toBe(2);
      });

      it('filters by period using the profile time zone, like rankings', async () => {
        const { id: userId, token } = await signedIn();
        const yesterday = addDays(today(), -1);
        await insertRun({
          userId,
          languageId: pythonId,
          startedAt: `${yesterday}T09:00:00Z`,
          localDate: yesterday,
          localWeekStart: startOfWeek(yesterday),
          score: 5,
        });

        const daily = HistoryResponseSchema.parse((await history(token, '?period=daily')).json());
        expect(daily.entries).toHaveLength(0);
        const total = HistoryResponseSchema.parse((await history(token, '?period=total')).json());
        expect(total.entries).toHaveLength(1);
      });

      it('weekly compares local_week_start, not local_date: last week is excluded, this week is not', async () => {
        const { id: userId, token } = await signedIn();
        const week = startOfWeek(today());
        const lastWeek = addDays(week, -7);
        // Mid-week, not the Sunday itself, so local_date differs from local_week_start — a query
        // that compared the wrong column would give a different answer for this row.
        const midWeek = addDays(week, 3);
        await insertRun({
          userId,
          languageId: pythonId,
          startedAt: `${midWeek}T09:00:00Z`,
          localDate: midWeek,
          localWeekStart: week,
          score: 11,
        });
        await insertRun({
          userId,
          languageId: pythonId,
          startedAt: `${lastWeek}T09:00:00Z`,
          localDate: lastWeek,
          localWeekStart: lastWeek,
          score: 22,
        });

        const weekly = HistoryResponseSchema.parse((await history(token, '?period=weekly')).json());
        expect(weekly.entries.map((e) => e.score)).toEqual([11]);
      });

      it('paginates, capping page size', async () => {
        const { id: userId, token } = await signedIn();
        const day = today();
        const week = startOfWeek(day);
        for (let i = 0; i < 5; i += 1) {
          await insertRun({
            userId,
            languageId: pythonId,
            startedAt: `${day}T0${String(i)}:00:00Z`,
            localDate: day,
            localWeekStart: week,
            score: i,
          });
        }
        const page1 = HistoryResponseSchema.parse(
          (await history(token, '?pageSize=2&page=1')).json(),
        );
        expect(page1.entries.map((e) => e.score)).toEqual([4, 3]);
        expect(page1.total).toBe(5);
        const page2 = HistoryResponseSchema.parse(
          (await history(token, '?pageSize=2&page=2')).json(),
        );
        expect(page2.entries.map((e) => e.score)).toEqual([2, 1]);

        const oversized = await history(token, '?pageSize=999');
        expect(oversized.statusCode).toBe(400);
      });

      it('requires a session', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/history',
          headers: { origin: TEST_APP_ORIGIN },
        });
        expect(response.statusCode).toBe(401);
      });
    });

    describe('DELETE /api/history/:id', () => {
      it('hard-deletes the row: it is gone, not merely flagged', async () => {
        const { id: userId, token } = await signedIn();
        const day = today();
        const runId = await insertRun({
          userId,
          languageId: pythonId,
          startedAt: `${day}T09:00:00Z`,
          localDate: day,
          localWeekStart: startOfWeek(day),
          score: 1,
        });

        const response = await deleteRun(token, runId);
        expect(response.statusCode).toBe(204);

        const [row] = await query<{ id: string }[]>('SELECT id FROM play_sessions WHERE id = $1', [
          runId,
        ]);
        expect(row).toBeUndefined();
      });

      it("refuses to delete another user's run, and does not reveal it exists", async () => {
        const owner = await signedIn();
        const attacker = await signedIn();
        const day = today();
        const runId = await insertRun({
          userId: owner.id,
          languageId: pythonId,
          startedAt: `${day}T09:00:00Z`,
          localDate: day,
          localWeekStart: startOfWeek(day),
          score: 1,
        });

        const response = await deleteRun(attacker.token, runId);
        expect(response.statusCode).toBe(404);

        const [row] = await query<{ id: string }[]>('SELECT id FROM play_sessions WHERE id = $1', [
          runId,
        ]);
        expect(row?.id).toBe(runId); // still there: the attacker's request did nothing
      });

      it('answers 404 for a run that does not exist', async () => {
        const { token } = await signedIn();
        const response = await deleteRun(token, '00000000-0000-4000-8000-000000000000');
        expect(response.statusCode).toBe(404);
      });
    });

    describe('deleting a run reflects immediately in rankings', () => {
      it('removes the deleted run from the ranking and promotes the next one', async () => {
        const { id: userId, token } = await signedIn();
        const day = today();
        const week = startOfWeek(day);
        const higher = await insertRun({
          userId,
          languageId: pythonId,
          startedAt: `${day}T09:00:00Z`,
          localDate: day,
          localWeekStart: week,
          score: 100,
        });
        await insertRun({
          userId,
          languageId: pythonId,
          startedAt: `${day}T10:00:00Z`,
          localDate: day,
          localWeekStart: week,
          score: 60,
        });

        const before = RankingsResponseSchema.parse(
          (await rankings(token, 'total', 'python')).json(),
        );
        expect(before.entries.map((e) => e.score)).toEqual([100, 60]);

        expect((await deleteRun(token, higher)).statusCode).toBe(204);

        const after = RankingsResponseSchema.parse(
          (await rankings(token, 'total', 'python')).json(),
        );
        expect(after.entries.map((e) => e.score)).toEqual([60]);
      });
    });
  },
);
