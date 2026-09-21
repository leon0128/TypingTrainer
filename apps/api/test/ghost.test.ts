import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  AuthResponseSchema,
  GhostRecordsResponseSchema,
  RankingsResponseSchema,
  StartSessionResponseSchema,
  SubmitResultResponseSchema,
  type GhostPeriod,
  type StartSessionResponse,
} from '@typing-trainer/contracts';
import {
  cpuScore,
  drawBlockIds,
  ghostTimeline,
  replaySession,
} from '@typing-trainer/typing-engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { ContentLibrary } from '../src/modules/content/content-library';
import { TEST_APP_ORIGIN, testEnv } from './support/env';
import { correctLog } from './support/play-log';
import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

const PASSWORD = 'correct horse battery staple';
const COOKIE = 'tt_session';
const STEP_MS = 50;
// UTC+14: its "today" differs from UTC's for most of every day, so a query using the server's own
// clock instead of the profile's would be caught.
const ZONE = 'Pacific/Kiritimati';

let counter = 0;
const nextUsername = () => `ghoster${String((counter += 1))}`;
let addressCounter = 0;
const nextAddress = () => `192.0.2.${String((addressCounter += 1) % 250)}`;

const addDays = (isoDate: string, delta: number): string => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
};
const startOfWeek = (isoDate: string): string =>
  addDays(isoDate, -new Date(`${isoDate}T00:00:00Z`).getUTCDay());
const todayIn = (timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());

describe.runIf(TEST_DATABASE_URL !== undefined)('Ghost (TEST_DATABASE_URL)', () => {
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
      payload: { username: nextUsername(), password: PASSWORD, timezone: ZONE },
    });
    expect(response.statusCode).toBe(201);
    return {
      id: AuthResponseSchema.parse(response.json()).user.id,
      token: response.cookies.find((cookie) => cookie.name === COOKIE)?.value ?? '',
    };
  }

  /** Inserts a run on a local date, so a test controls the day, the score, and the mode exactly. */
  async function insertRun(row: {
    userId: string;
    localDate: string;
    score: number;
    language?: string;
    mode?: 'single' | 'cpu';
  }): Promise<string> {
    const cpu = row.mode === 'cpu';
    const [inserted] = await query<{ id: string }[]>(
      `INSERT INTO play_sessions (
         user_id, mode, language_id, duration_sec, started_at, timezone, local_date,
         local_week_start, raw_keystrokes, effective_keystrokes, miss_count, kpm, accuracy, score,
         rng_seed, content_revision, app_version, cpu_level, opponent_score, result)
       VALUES ($1, $2, $3, 120, $4, $5, $6, $7, 100, 100, 0, 50, 1, $8, 1, $9, 'dev', $10, $11, $12)
       RETURNING id`,
      [
        row.userId,
        cpu ? 'cpu' : 'single',
        languageIds.get(row.language ?? 'python'),
        `${row.localDate}T10:00:00Z`,
        ZONE,
        row.localDate,
        startOfWeek(row.localDate),
        row.score,
        'a'.repeat(64),
        cpu ? 5 : null,
        cpu ? 1 : null,
        cpu ? 'win' : null,
      ],
    );
    return inserted?.id ?? '';
  }

  const start = (token: string, payload: unknown) =>
    app.inject({
      method: 'POST',
      url: '/api/play/sessions',
      headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${token}` },
      payload: payload as Record<string, unknown>,
    });

  async function startGhost(
    token: string,
    ghostPeriod: GhostPeriod,
  ): Promise<StartSessionResponse> {
    const response = await start(token, { language: 'python', mode: 'ghost', ghostPeriod });
    expect(response.statusCode).toBe(201);
    return StartSessionResponseSchema.parse(response.json());
  }

  const submit = (token: string, sessionId: string, body: unknown) =>
    app.inject({
      method: 'POST',
      url: `/api/play/sessions/${sessionId}/result`,
      headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${token}` },
      payload: body as Record<string, unknown>,
    });

  const aged = (sessionId: string, seconds: number) =>
    query('UPDATE issued_runs SET issued_at = now() - make_interval(secs => $2) WHERE id = $1', [
      sessionId,
      seconds,
    ]);

  const get = (token: string, url: string) =>
    app.inject({
      method: 'GET',
      url,
      headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${token}` },
    });

  beforeAll(async () => {
    database = await createTestDatabase(TEST_DATABASE_URL ?? '');
    app = await createApp(testEnv({ DATABASE_URL: database.url, REGISTRATION_DAILY_LIMIT: '500' }));
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

  describe('GET /api/ghost-records', () => {
    const records = async (token: string) =>
      new Map(
        GhostRecordsResponseSchema.parse(
          (await get(token, '/api/ghost-records')).json(),
        ).languages.map((entry) => [entry.language, entry]),
      );

    it('has no record for a new player, in every language', async () => {
      const me = await signedIn();
      const state = await records(me.token);
      expect([...state.keys()]).toEqual(['typescript', 'go', 'java', 'python']);
      for (const entry of state.values()) {
        expect(entry).toMatchObject({ daily: null, weekly: null, total: null });
      }
    });

    it('gives the best of each period, by the profile time zone', async () => {
      const me = await signedIn();
      const today = todayIn(ZONE);
      const sunday = startOfWeek(today);
      // Mid-week and a week apart on purpose: today, earlier this week (unless today is the
      // Sunday), last week, and long ago.
      await insertRun({ userId: me.id, localDate: today, score: 40 });
      await insertRun({ userId: me.id, localDate: today, score: 55 });
      await insertRun({ userId: me.id, localDate: addDays(sunday, -1), score: 70 });
      await insertRun({ userId: me.id, localDate: addDays(today, -200), score: 90 });

      const python = (await records(me.token)).get('python');
      expect(python?.daily).toBe(55);
      expect(python?.weekly).toBe(55);
      expect(python?.total).toBe(90);
    });

    it('takes the weekly best from earlier in the same week, not only from today', async () => {
      const me = await signedIn();
      const sunday = startOfWeek(todayIn(ZONE));
      await insertRun({ userId: me.id, localDate: sunday, score: 66 });
      await insertRun({ userId: me.id, localDate: addDays(sunday, -3), score: 99 });
      const python = (await records(me.token)).get('python');
      expect(python?.weekly).toBe(66);
      expect(python?.total).toBe(99);
    });

    it('counts runs of every mode, and keeps languages and players apart', async () => {
      const me = await signedIn();
      const other = await signedIn();
      const today = todayIn(ZONE);
      await insertRun({ userId: me.id, localDate: today, score: 30 });
      await insertRun({ userId: me.id, localDate: today, score: 80, mode: 'cpu' });
      await insertRun({ userId: me.id, localDate: today, score: 45, language: 'go' });
      await insertRun({ userId: other.id, localDate: today, score: 999 });

      const state = await records(me.token);
      expect(state.get('python')).toMatchObject({ daily: 80, total: 80 });
      expect(state.get('go')).toMatchObject({ daily: 45, total: 45 });
      expect(state.get('java')).toMatchObject({ daily: null, total: null });
    });

    it('requires a session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/ghost-records',
        headers: { origin: TEST_APP_ORIGIN },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('starting a Ghost run', () => {
    it('takes the record of the period chosen, and keeps its score with the run', async () => {
      const me = await signedIn();
      const today = todayIn(ZONE);
      await insertRun({ userId: me.id, localDate: today, score: 50 });
      await insertRun({ userId: me.id, localDate: addDays(today, -40), score: 120 });

      const daily = await startGhost(me.token, 'daily');
      expect(daily).toMatchObject({ mode: 'ghost', ghostPeriod: 'daily', ghostScore: 50 });
      const total = await startGhost(me.token, 'total');
      expect(total).toMatchObject({ ghostPeriod: 'total', ghostScore: 120 });

      const bundle = app.get(ContentLibrary).get('python');
      expect(daily.blocks.map((block) => block.blockId)).toEqual(
        drawBlockIds(bundle?.blockIds ?? [], BigInt(daily.seed)),
      );
      const [row] = await query<
        { mode: string; ghost_period: string; ghost_score: number; cpu_level: number | null }[]
      >('SELECT mode, ghost_period, ghost_score, cpu_level FROM issued_runs WHERE id = $1', [
        daily.sessionId,
      ]);
      expect(row).toEqual({
        mode: 'ghost',
        ghost_period: 'daily',
        ghost_score: 50,
        cpu_level: null,
      });
    });

    it('races the best of the period even when it came from a CPU run', async () => {
      const me = await signedIn();
      await insertRun({ userId: me.id, localDate: todayIn(ZONE), score: 77, mode: 'cpu' });
      expect((await startGhost(me.token, 'daily')).ghostScore).toBe(77);
    });

    it.each(['daily', 'weekly', 'total'] as const)(
      'refuses %s when there is no record',
      async (period) => {
        const me = await signedIn();
        const response = await start(me.token, {
          language: 'python',
          mode: 'ghost',
          ghostPeriod: period,
        });
        expect(response.statusCode).toBe(409);
      },
    );

    it('refuses a period whose only record is in another period, and another language', async () => {
      const me = await signedIn();
      const today = todayIn(ZONE);
      await insertRun({ userId: me.id, localDate: addDays(today, -60), score: 88 });
      await insertRun({ userId: me.id, localDate: today, score: 88, language: 'go' });
      for (const period of ['daily', 'weekly'] as const) {
        expect(
          (await start(me.token, { language: 'python', mode: 'ghost', ghostPeriod: period }))
            .statusCode,
        ).toBe(409);
      }
      expect((await startGhost(me.token, 'total')).ghostScore).toBe(88);
    });

    it('cannot race another player’s record', async () => {
      const me = await signedIn();
      const other = await signedIn();
      await insertRun({ userId: other.id, localDate: todayIn(ZONE), score: 500 });
      expect(
        (await start(me.token, { language: 'python', mode: 'ghost', ghostPeriod: 'total' }))
          .statusCode,
      ).toBe(409);
    });

    it('will not pace a Ghost by a record of zero', async () => {
      const me = await signedIn();
      await insertRun({ userId: me.id, localDate: todayIn(ZONE), score: 0 });
      expect(
        (await start(me.token, { language: 'python', mode: 'ghost', ghostPeriod: 'daily' }))
          .statusCode,
      ).toBe(409);
    });

    it.each([
      ['Ghost without a period', { language: 'python', mode: 'ghost' }],
      ['a period on single play', { language: 'python', mode: 'single', ghostPeriod: 'daily' }],
      [
        'a period on vs CPU',
        { language: 'python', mode: 'cpu', cpuLevel: 3, ghostPeriod: 'daily' },
      ],
      [
        'a level on Ghost',
        { language: 'python', mode: 'ghost', ghostPeriod: 'daily', cpuLevel: 3 },
      ],
      ['an unknown period', { language: 'python', mode: 'ghost', ghostPeriod: 'monthly' }],
    ])('refuses %s', async (_name, payload) => {
      expect((await start((await signedIn()).token, payload)).statusCode).toBe(400);
    });

    it('ignores a record the client names: the score comes from the player’s own runs', async () => {
      const me = await signedIn();
      await insertRun({ userId: me.id, localDate: todayIn(ZONE), score: 50 });
      const response = await start(me.token, {
        language: 'python',
        mode: 'ghost',
        ghostPeriod: 'daily',
        ghostScore: 1,
      });
      expect(StartSessionResponseSchema.parse(response.json()).ghostScore).toBe(50);
    });
  });

  describe('judging a Ghost run', () => {
    /** Issues Ghost runs until one whose blocks let a log score exactly `target`; returns its keys. */
    async function runScoring(token: string, target: number) {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const run = await startGhost(token, 'total');
        for (let keys = 1; keys <= 400; keys += 1) {
          const score = replaySession(run.blocks, correctLog(run.blocks, keys, STEP_MS)).metrics
            .score;
          if (score === target) return { run, keys };
          if (score > target) break;
        }
      }
      throw new Error('no run drew blocks whose score can land on the record');
    }

    async function played(token: string, run: StartSessionResponse, keys: number) {
      await aged(run.sessionId, (keys * STEP_MS) / 1000 + 1);
      return submit(token, run.sessionId, { log: correctLog(run.blocks, keys, STEP_MS) });
    }

    it('gives the Ghost exactly the record it reproduces, and a win to a player who beats it', async () => {
      const me = await signedIn();
      await insertRun({ userId: me.id, localDate: todayIn(ZONE), score: 60 });
      const run = await startGhost(me.token, 'total');
      const response = await played(me.token, run, 200);
      expect(response.statusCode).toBe(201);
      const { run: stored } = SubmitResultResponseSchema.parse(response.json());

      // §4.4: pacing by score makes the Ghost's final score the record itself.
      expect(stored.opponentScore).toBe(60);
      expect(stored).toMatchObject({
        mode: 'ghost',
        ghostPeriod: 'total',
        cpuLevel: null,
        result: 'win',
      });
      const [row] = await query<
        {
          mode: string;
          ghost_period: string;
          opponent_score: number;
          result: string;
          cpu_level: number | null;
        }[]
      >(
        'SELECT mode, ghost_period, opponent_score, result, cpu_level FROM play_sessions WHERE id = $1',
        [stored.id],
      );
      expect(row).toEqual({
        mode: 'ghost',
        ghost_period: 'total',
        opponent_score: 60,
        result: 'win',
        cpu_level: null,
      });
    });

    it('counts a tie with the record as a win', async () => {
      const me = await signedIn();
      await insertRun({ userId: me.id, localDate: todayIn(ZONE), score: 60 });
      const { run, keys } = await runScoring(me.token, 60);
      const { run: stored } = SubmitResultResponseSchema.parse(
        (await played(me.token, run, keys)).json(),
      );
      expect(stored).toMatchObject({ score: 60, opponentScore: 60, result: 'win' });
    });

    it('loses to the record by one point', async () => {
      const me = await signedIn();
      await insertRun({ userId: me.id, localDate: todayIn(ZONE), score: 60 });
      const { run, keys } = await runScoring(me.token, 59);
      const { run: stored } = SubmitResultResponseSchema.parse(
        (await played(me.token, run, keys)).json(),
      );
      expect(stored).toMatchObject({ score: 59, opponentScore: 60, result: 'lose' });
    });

    it('judges by the record as it was when the run was issued', async () => {
      const me = await signedIn();
      const record = await insertRun({ userId: me.id, localDate: todayIn(ZONE), score: 60 });
      const run = await startGhost(me.token, 'total');
      // The record is deleted and a far better run appears before the result arrives.
      await query('DELETE FROM play_sessions WHERE id = $1', [record]);
      await insertRun({ userId: me.id, localDate: todayIn(ZONE), score: 900 });

      const { run: stored } = SubmitResultResponseSchema.parse(
        (await played(me.token, run, 200)).json(),
      );
      expect(stored.opponentScore).toBe(60);
      expect(stored.result).toBe('win');
    });

    it('recomputes the Ghost on the server and ignores what the client claims', async () => {
      const me = await signedIn();
      await insertRun({ userId: me.id, localDate: todayIn(ZONE), score: 900 });
      const run = await startGhost(me.token, 'total');
      await aged(run.sessionId, (100 * STEP_MS) / 1000 + 1);
      const response = await submit(me.token, run.sessionId, {
        log: correctLog(run.blocks, 100, STEP_MS),
        result: 'win',
        opponentScore: 0,
        ghostScore: 1,
        ghostPeriod: 'daily',
      });
      const { run: stored } = SubmitResultResponseSchema.parse(response.json());
      expect(stored).toMatchObject({
        opponentScore: cpuScore(ghostTimeline(run.blocks, 900)),
        ghostPeriod: 'total',
        result: 'lose',
      });
    });

    it('makes the run a candidate for the next record, and shows in the ranking as a Ghost run', async () => {
      const me = await signedIn();
      await insertRun({ userId: me.id, localDate: todayIn(ZONE), score: 20 });
      const run = await startGhost(me.token, 'total');
      const { run: stored } = SubmitResultResponseSchema.parse(
        (await played(me.token, run, 200)).json(),
      );
      expect(stored.result).toBe('win');

      const ranking = RankingsResponseSchema.parse(
        (await get(me.token, '/api/rankings?period=total&language=python')).json(),
      );
      expect(ranking.entries[0]).toMatchObject({ id: stored.id, mode: 'ghost' });
      const next = await startGhost(me.token, 'total');
      expect(next.ghostScore).toBe(stored.score);
    });
  });

  describe('the issued_runs constraint', () => {
    it.each([
      ['a Ghost run with no period', 'ghost', null, null, null],
      ['a Ghost run with no score', 'ghost', 'daily', null, null],
      ['a Ghost run with a score of 0', 'ghost', 'daily', 0, null],
      ['a Ghost run with an unknown period', 'ghost', 'monthly', 5, null],
      ['a Ghost run that also has a level', 'ghost', 'daily', 5, 3],
      ['a single run with a Ghost score', 'single', null, 5, null],
      ['a single run with a Ghost period', 'single', 'daily', null, null],
      ['a vs CPU run with a Ghost period', 'cpu', 'daily', null, 3],
    ])('refuses %s', async (_name, mode, period, score, level) => {
      const me = await signedIn();
      const probe = await startGhostSource(me);
      await expect(
        query(
          `INSERT INTO issued_runs (user_id, language_id, mode, cpu_level, ghost_period, ghost_score,
                                    rng_seed, content_revision, block_ids)
           SELECT user_id, language_id, $2, $3, $4, $5, 1, content_revision, block_ids
           FROM issued_runs WHERE id = $1`,
          [probe, mode, level, period, score],
        ),
      ).rejects.toThrow(/chk_issued_runs_opponent/);
    });

    async function startGhostSource(me: { id: string; token: string }): Promise<string> {
      const response = await start(me.token, { language: 'python' });
      return StartSessionResponseSchema.parse(response.json()).sessionId;
    }
  });
});
