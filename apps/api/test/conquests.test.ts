import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  AuthResponseSchema,
  ConquestsResponseSchema,
  DashboardResponseSchema,
} from '@typing-trainer/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { TEST_APP_ORIGIN, testEnv } from './support/env';
import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

const PASSWORD = 'correct horse battery staple';
const COOKIE = 'tt_session';

let counter = 0;
const nextUsername = () => `conqueror${String((counter += 1))}`;
let addressCounter = 0;
const nextAddress = () => `198.18.0.${String((addressCounter += 1))}`;

describe.runIf(TEST_DATABASE_URL !== undefined)(
  'GET /api/cpu-conquests (TEST_DATABASE_URL)',
  () => {
    let database: TestDatabase;
    let app: NestFastifyApplication;
    const languageIds = new Map<string, number>();

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
      return {
        id: AuthResponseSchema.parse(response.json()).user.id,
        token: response.cookies.find((cookie) => cookie.name === COOKIE)?.value ?? '',
      };
    }

    /** Inserts a run directly, so a test controls the mode, level, and result exactly. */
    async function insertRun(row: {
      userId: string;
      language?: string;
      mode?: 'single' | 'cpu';
      level?: number;
      result?: 'win' | 'lose';
      score?: number;
    }): Promise<string> {
      const cpu = (row.mode ?? 'cpu') === 'cpu';
      const [inserted] = await query<{ id: string }[]>(
        `INSERT INTO play_sessions (
         user_id, mode, language_id, duration_sec, started_at, timezone, local_date,
         local_week_start, raw_keystrokes, effective_keystrokes, miss_count, kpm, accuracy, score,
         rng_seed, content_revision, app_version, cpu_level, opponent_score, result)
       VALUES ($1, $2, $3, 120, '2026-09-16T10:00:00Z', 'UTC', '2026-09-16', '2026-09-13', 100,
               100, 0, 50, 1, $4, 1, $5, 'dev', $6, $7, $8)
       RETURNING id`,
        [
          row.userId,
          cpu ? 'cpu' : 'single',
          languageIds.get(row.language ?? 'python'),
          row.score ?? 50,
          'a'.repeat(64),
          cpu ? (row.level ?? 1) : null,
          cpu ? 50 : null,
          cpu ? (row.result ?? 'win') : null,
        ],
      );
      return inserted?.id ?? '';
    }

    const get = (token: string, url: string) =>
      app.inject({
        method: 'GET',
        url,
        headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${token}` },
      });

    const conquests = async (token: string) => {
      const response = await get(token, '/api/cpu-conquests');
      expect(response.statusCode).toBe(200);
      return new Map(
        ConquestsResponseSchema.parse(response.json()).languages.map((entry) => [
          entry.language,
          entry,
        ]),
      );
    };

    const highestOnDashboard = async (token: string) =>
      DashboardResponseSchema.parse(
        (await get(token, '/api/dashboard?period=total&language=python')).json(),
      ).summary.highestCpuLevelBeaten;

    beforeAll(async () => {
      database = await createTestDatabase(TEST_DATABASE_URL ?? '');
      app = await createApp(
        testEnv({ DATABASE_URL: database.url, REGISTRATION_DAILY_LIMIT: '500' }),
      );
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
      for (const row of await query<{ id: number; slug: string }[]>(
        'SELECT id, slug FROM languages',
      )) {
        languageIds.set(row.slug, row.id);
      }
    });

    afterAll(async () => {
      await app.close();
      await database.drop();
    });

    it('lists every enabled language, with nothing beaten for a new player', async () => {
      const me = await signedIn();
      const state = await conquests(me.token);
      expect([...state.keys()]).toEqual(['typescript', 'go', 'java', 'python']);
      for (const entry of state.values()) {
        expect(entry).toMatchObject({ highestLevel: null, beatenLevels: [], totalConquests: 0 });
      }
      expect(await highestOnDashboard(me.token)).toBeNull();
    });

    it('counts only vs CPU wins: a tie is a win; losses and single play are not', async () => {
      const me = await signedIn();
      await insertRun({ userId: me.id, level: 10, result: 'win' });
      await insertRun({ userId: me.id, level: 30, result: 'lose' });
      // Single play at a huge score says nothing about any CPU level (Q2).
      await insertRun({ userId: me.id, mode: 'single', score: 9999 });

      const python = (await conquests(me.token)).get('python');
      expect(python).toEqual({
        language: 'python',
        highestLevel: 10,
        beatenLevels: [10],
        totalConquests: 1,
      });
      // The dashboard's highest level ignores the loss at 30 too.
      expect(await highestOnDashboard(me.token)).toBe(10);
    });

    it('counts a level once however often it was beaten, and lists levels ascending', async () => {
      const me = await signedIn();
      for (const level of [50, 3, 50, 50, 20, 3]) await insertRun({ userId: me.id, level });

      const python = (await conquests(me.token)).get('python');
      expect(python).toMatchObject({
        highestLevel: 50,
        beatenLevels: [3, 20, 50],
        totalConquests: 3,
      });
    });

    it('keeps languages apart: beating level 50 in Go says nothing about Python', async () => {
      const me = await signedIn();
      await insertRun({ userId: me.id, language: 'go', level: 50 });
      await insertRun({ userId: me.id, language: 'java', level: 2 });

      const state = await conquests(me.token);
      expect(state.get('go')).toMatchObject({ highestLevel: 50, beatenLevels: [50] });
      expect(state.get('java')).toMatchObject({ highestLevel: 2, beatenLevels: [2] });
      expect(state.get('python')).toMatchObject({ highestLevel: null, beatenLevels: [] });
      expect(state.get('typescript')).toMatchObject({ totalConquests: 0 });
    });

    it("never includes another player's wins", async () => {
      const me = await signedIn();
      const other = await signedIn();
      await insertRun({ userId: other.id, level: 99 });
      await insertRun({ userId: me.id, level: 4 });

      expect((await conquests(me.token)).get('python')?.beatenLevels).toEqual([4]);
      expect(await highestOnDashboard(me.token)).toBe(4);
    });

    it('shows the highest level beaten in any language on the dashboard summary', async () => {
      const me = await signedIn();
      await insertRun({ userId: me.id, language: 'python', level: 12 });
      await insertRun({ userId: me.id, language: 'go', level: 40 });
      // The dashboard is asked about Python, and still reports across languages (§6.2).
      expect(await highestOnDashboard(me.token)).toBe(40);
    });

    describe('deleting history (§6.3, Q15)', () => {
      const del = (token: string, id: string) =>
        app.inject({
          method: 'DELETE',
          url: `/api/history/${id}`,
          headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${token}` },
        });

      it('removes a conquest with the run that earned it, on the next request', async () => {
        const me = await signedIn();
        await insertRun({ userId: me.id, level: 5 });
        const top = await insertRun({ userId: me.id, level: 60 });
        expect((await conquests(me.token)).get('python')?.beatenLevels).toEqual([5, 60]);
        expect(await highestOnDashboard(me.token)).toBe(60);

        expect((await del(me.token, top)).statusCode).toBe(204);

        const python = (await conquests(me.token)).get('python');
        expect(python).toMatchObject({ highestLevel: 5, beatenLevels: [5], totalConquests: 1 });
        expect(await highestOnDashboard(me.token)).toBe(5);
      });

      it('keeps a level while another winning run at it remains', async () => {
        const me = await signedIn();
        const first = await insertRun({ userId: me.id, level: 7 });
        await insertRun({ userId: me.id, level: 7 });

        await del(me.token, first);
        expect((await conquests(me.token)).get('python')?.beatenLevels).toEqual([7]);
      });
    });

    it('requires a session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/cpu-conquests',
        headers: { origin: TEST_APP_ORIGIN },
      });
      expect(response.statusCode).toBe(401);
    });
  },
);
