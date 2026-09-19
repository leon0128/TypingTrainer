import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ApiErrorSchema,
  StartSessionResponseSchema,
  SubmitResultResponseSchema,
  type SessionLog,
  type StartSessionResponse,
} from '@typing-trainer/contracts';
import { replaySession } from '@typing-trainer/typing-engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { PLAUSIBILITY_LIMITS } from '../src/modules/play/plausibility-limits';
import { TEST_APP_ORIGIN, testEnv } from './support/env';
import { correctLog, logOf } from './support/play-log';
import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

const PASSWORD = 'correct horse battery staple';
const COOKIE = 'tt_session';
const KEYS = 200;
const STEP_MS = 100;

let counter = 0;
const nextUsername = () => `runner${String((counter += 1))}`;
const nextAddress = () => `203.0.113.${String((counter += 1) % 250)}`;

interface PlaySessionRow {
  user_id: string;
  mode: string;
  duration_sec: number;
  started_at: Date;
  timezone: string;
  local_date: string;
  local_week_start: string;
  raw_keystrokes: number;
  effective_keystrokes: number;
  miss_count: number;
  kpm: string;
  accuracy: string;
  score: number;
  cpu_level: number | null;
  result: string | null;
  rng_seed: string;
  content_revision: string;
  app_version: string;
}

describe.runIf(TEST_DATABASE_URL !== undefined)(
  'POST /api/play/sessions/:id/result (TEST_DATABASE_URL)',
  () => {
    let database: TestDatabase;
    let app: NestFastifyApplication;

    const query = <T>(sql: string, parameters: unknown[] = []) =>
      database.dataSource.query<T>(sql, parameters);

    /** Registers a player and returns their session token. */
    async function signedIn(timezone = 'UTC'): Promise<string> {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        remoteAddress: nextAddress(),
        headers: { origin: TEST_APP_ORIGIN },
        payload: { username: nextUsername(), password: PASSWORD, timezone },
      });
      expect(response.statusCode).toBe(201);
      return response.cookies.find((cookie) => cookie.name === COOKIE)?.value ?? '';
    }

    async function startRun(token: string, language = 'python'): Promise<StartSessionResponse> {
      const response = await app.inject({
        method: 'POST',
        url: '/api/play/sessions',
        headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${token}` },
        payload: { language },
      });
      expect(response.statusCode).toBe(201);
      return StartSessionResponseSchema.parse(response.json());
    }

    const submit = (token: string, sessionId: string, log: SessionLog) =>
      app.inject({
        method: 'POST',
        url: `/api/play/sessions/${sessionId}/result`,
        headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${token}` },
        payload: { log },
      });

    /**
     * Back-dates the issue by `seconds`, so a log that claims that much run time fits the wall
     * clock the server measures between issuing and submission (§9.8).
     */
    const aged = (sessionId: string, seconds: number) =>
      query('UPDATE issued_runs SET issued_at = now() - make_interval(secs => $2) WHERE id = $1', [
        sessionId,
        seconds,
      ]);

    /** Plays a run correctly, taking the time the log claims, and submits it. */
    async function played(token: string, language = 'python') {
      const run = await startRun(token, language);
      const log = correctLog(run.blocks, KEYS, STEP_MS);
      await aged(run.sessionId, (KEYS * STEP_MS) / 1000 + 1);
      return { run, log, response: await submit(token, run.sessionId, log) };
    }

    // The date columns are read as text: the driver would turn a date into a Date at midnight
    // of the server's own zone, which is not the local date that was stored.
    const storedRun = (id: string) =>
      query<PlaySessionRow[]>(
        `SELECT *, local_date::text AS local_date, local_week_start::text AS local_week_start
         FROM play_sessions WHERE id = $1`,
        [id],
      ).then((rows) => rows[0]);

    beforeAll(async () => {
      database = await createTestDatabase(TEST_DATABASE_URL ?? '');
      app = await createApp(
        testEnv({ DATABASE_URL: database.url, REGISTRATION_DAILY_LIMIT: '500' }),
      );
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
    });

    afterAll(async () => {
      await app.close();
      await database.drop();
    });

    it('stores a run with the metrics the server recomputed from the log', async () => {
      const token = await signedIn();
      const { run, log, response } = await played(token);
      expect(response.statusCode).toBe(201);
      const { run: result } = SubmitResultResponseSchema.parse(response.json());

      // The server replays the log itself; the client sends no metrics at all (§9.8).
      const expected = replaySession(run.blocks, log).metrics;
      // Indentation and closing brackets the engine inserts count as effective keystrokes (§4.3).
      expect(expected.effective).toBeGreaterThan(KEYS);
      expect(result).toMatchObject({
        language: 'python',
        mode: 'single',
        effectiveKeystrokes: expected.effective,
        missCount: 0,
        rawKeystrokes: KEYS,
        kpm: expected.kpm,
        accuracy: 1,
        score: expected.score,
      });

      const row = await storedRun(result.id);
      expect(row).toMatchObject({
        mode: 'single',
        duration_sec: 120,
        timezone: 'UTC',
        raw_keystrokes: KEYS,
        effective_keystrokes: expected.effective,
        miss_count: 0,
        score: expected.score,
        rng_seed: run.seed,
        content_revision: run.contentRevision,
        app_version: 'dev',
        cpu_level: null,
        result: null,
      });
      expect(Number(row?.kpm)).toBe(expected.kpm);
      expect(Number(row?.accuracy)).toBe(1);
    });

    it('dates the run back from the submission by the time played, in the profile time zone', async () => {
      for (const timezone of ['Asia/Tokyo', 'America/New_York']) {
        const token = await signedIn(timezone);
        const { response } = await played(token);
        const { run: result } = SubmitResultResponseSchema.parse(response.json());
        const row = await storedRun(result.id);
        const startedAt = new Date(result.startedAt);

        // The log spans (KEYS - 1) steps of run time before the submission.
        const playedMs = (KEYS - 1) * STEP_MS;
        expect(Date.now() - startedAt.getTime()).toBeGreaterThanOrEqual(playedMs);
        expect(Date.now() - startedAt.getTime()).toBeLessThan(playedMs + 60_000);

        const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(
          startedAt,
        );
        expect(result.localDate).toBe(localDate);
        expect(row?.local_date).toBe(localDate);
        // The week starts on the preceding Sunday (§6.1).
        const weekStart = new Date(`${row?.local_week_start ?? ''}T00:00:00Z`);
        expect(weekStart.getUTCDay()).toBe(0);
        const days = (Date.parse(`${localDate}T00:00:00Z`) - weekStart.getTime()) / 86_400_000;
        expect(days).toBeGreaterThanOrEqual(0);
        expect(days).toBeLessThan(7);
      }
    });

    it('never dates a run back before it was issued', async () => {
      const token = await signedIn();
      const run = await startRun(token);
      // Submitted at once, so the log claims more run time than has passed, within the tolerance.
      const response = await submit(token, run.sessionId, correctLog(run.blocks, 10, STEP_MS));
      expect(response.statusCode).toBe(201);
      const { run: result } = SubmitResultResponseSchema.parse(response.json());
      const [issued] = await query<{ issued_at: Date }[]>(
        'SELECT issued_at FROM issued_runs WHERE id = $1',
        [run.sessionId],
      );
      expect(new Date(result.startedAt).getTime()).toBe(issued?.issued_at.getTime());
    });

    it('stores a run with no correct keystroke as a score of zero', async () => {
      const token = await signedIn();
      const run = await startRun(token);
      // A key no block starts with, so every keystroke is a miss.
      await aged(run.sessionId, (50 * STEP_MS) / 1000 + 1);
      const response = await submit(token, run.sessionId, logOf(Array(50).fill('~'), STEP_MS));
      expect(response.statusCode).toBe(201);
      const { run: result } = SubmitResultResponseSchema.parse(response.json());
      expect(result).toMatchObject({
        effectiveKeystrokes: 0,
        // Wrong keys at the same position count as one miss until a correct key arrives (§4.3.2).
        missCount: 1,
        score: 0,
        accuracy: 0,
      });
      expect(await storedRun(result.id)).toBeDefined();
    });

    it('answers 204 and stores nothing when no key was pressed, using up the run', async () => {
      const token = await signedIn();
      const run = await startRun(token);
      const response = await submit(token, run.sessionId, { version: 1, keys: '', deltas: [] });
      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
      const [{ count } = { count: '' }] = await query<{ count: string }[]>(
        'SELECT count(*) FROM play_sessions WHERE rng_seed = $1',
        [run.seed],
      );
      expect(count).toBe('0');
      const again = await submit(token, run.sessionId, correctLog(run.blocks, KEYS, STEP_MS));
      expect(again.statusCode).toBe(409);
    });

    it('accepts a run only once, from its owner, and only while it is fresh', async () => {
      const token = await signedIn();
      const { run, log, response } = await played(token);
      expect(response.statusCode).toBe(201);
      expect((await submit(token, run.sessionId, log)).statusCode).toBe(409);

      const other = await signedIn();
      const theirs = await startRun(other);
      expect((await submit(token, theirs.sessionId, log)).statusCode).toBe(404);
      expect((await submit(token, '00000000-0000-4000-8000-000000000000', log)).statusCode).toBe(
        404,
      );
      expect((await submit(token, 'not-a-uuid', log)).statusCode).toBe(400);

      const stale = await startRun(token);
      await query(
        `UPDATE issued_runs SET issued_at = now() - interval '18 minutes' WHERE id = $1`,
        [stale.sessionId],
      );
      const expired = await submit(token, stale.sessionId, log);
      expect(expired.statusCode).toBe(410);
      expect(ApiErrorSchema.parse(expired.json()).message).toMatch(/too old/);
    });

    it('refuses a result when the content changed since the run was issued', async () => {
      const token = await signedIn();
      const run = await startRun(token);
      await query(`UPDATE issued_runs SET content_revision = $2 WHERE id = $1`, [
        run.sessionId,
        'f'.repeat(64),
      ]);
      const response = await submit(token, run.sessionId, correctLog(run.blocks, KEYS, STEP_MS));
      expect(response.statusCode).toBe(409);
      expect(ApiErrorSchema.parse(response.json()).message).toMatch(/content changed/);
    });

    it.each([
      [
        'a first key after the countdown started',
        (run: StartSessionResponse): SessionLog => {
          const log = correctLog(run.blocks, 10, STEP_MS);
          return { ...log, deltas: [5, ...log.deltas.slice(1)] };
        },
        'log-start',
      ],
      [
        'keys logged after the run ended',
        (run: StartSessionResponse): SessionLog => correctLog(run.blocks, 3, 61_000),
        'keys-after-end',
      ],
      [
        'more run time than has passed',
        (run: StartSessionResponse): SessionLog => correctLog(run.blocks, 3, 30_000),
        'run-time',
      ],
      [
        'a burst no human can type',
        // Enough keys to fill a ten-second window past the peak limit.
        (run: StartSessionResponse): SessionLog =>
          correctLog(run.blocks, PLAUSIBILITY_LIMITS.maxPeakKpm10s / 6 + 100, 20),
        'speed',
      ],
    ])('refuses %s with 422', async (_, makeLog, reason) => {
      const token = await signedIn();
      const run = await startRun(token);
      // Ten seconds of wall clock: enough for every log below but the one that claims far more.
      await aged(run.sessionId, 10);
      const response = await submit(token, run.sessionId, makeLog(run));
      expect(response.statusCode).toBe(422);
      expect(ApiErrorSchema.parse(response.json()).message).toBe(`result rejected: ${reason}`);
      // A rejected result still uses up the run, so a second log cannot be tried.
      expect(
        (await submit(token, run.sessionId, correctLog(run.blocks, KEYS, STEP_MS))).statusCode,
      ).toBe(409);
    });

    it('refuses a run left idle past the limit', async () => {
      const token = await signedIn();
      const run = await startRun(token);
      await query(
        `UPDATE issued_runs SET issued_at = now() - interval '16 minutes' WHERE id = $1`,
        [run.sessionId],
      );
      const response = await submit(token, run.sessionId, correctLog(run.blocks, 10, STEP_MS));
      expect(response.statusCode).toBe(422);
      expect(ApiErrorSchema.parse(response.json()).message).toBe('result rejected: idle');
    });

    it('refuses a log larger than the result body limit', async () => {
      const token = await signedIn();
      const run = await startRun(token);
      const response = await app.inject({
        method: 'POST',
        url: `/api/play/sessions/${run.sessionId}/result`,
        headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${token}` },
        payload: { log: { version: 1, keys: 'x'.repeat(300 * 1024), deltas: [] } },
      });
      expect(response.statusCode).toBe(413);
    });
  },
);
