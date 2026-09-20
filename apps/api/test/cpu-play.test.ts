import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  AuthResponseSchema,
  StartSessionResponseSchema,
  SubmitResultResponseSchema,
  type StartSessionResponse,
} from '@typing-trainer/contracts';
import { cpuScore, cpuTimeline, drawBlockIds, replaySession } from '@typing-trainer/typing-engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { ContentLibrary } from '../src/modules/content/content-library';
import { TEST_APP_ORIGIN, testEnv } from './support/env';
import { correctLog } from './support/play-log';
import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

const PASSWORD = 'correct horse battery staple';
const COOKIE = 'tt_session';
const STEP_MS = 50;

let counter = 0;
const nextUsername = () => `cpuplayer${String((counter += 1))}`;
const nextAddress = () => `192.0.2.${String((counter += 1) % 250)}`;

describe.runIf(TEST_DATABASE_URL !== undefined)('vs CPU (TEST_DATABASE_URL)', () => {
  let database: TestDatabase;
  let app: NestFastifyApplication;

  const query = <T>(sql: string, parameters: unknown[] = []) =>
    database.dataSource.query<T>(sql, parameters);

  async function signedIn(): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      remoteAddress: nextAddress(),
      headers: { origin: TEST_APP_ORIGIN },
      payload: { username: nextUsername(), password: PASSWORD },
    });
    expect(response.statusCode).toBe(201);
    AuthResponseSchema.parse(response.json());
    return response.cookies.find((cookie) => cookie.name === COOKIE)?.value ?? '';
  }

  const start = (token: string, payload: unknown) =>
    app.inject({
      method: 'POST',
      url: '/api/play/sessions',
      headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${token}` },
      payload: payload as Record<string, unknown>,
    });

  async function startCpu(token: string, cpuLevel: number): Promise<StartSessionResponse> {
    const response = await start(token, { language: 'python', mode: 'cpu', cpuLevel });
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

  /** Back-dates the issue so a log claiming that much run time fits the server's wall clock. */
  const aged = (sessionId: string, seconds: number) =>
    query('UPDATE issued_runs SET issued_at = now() - make_interval(secs => $2) WHERE id = $1', [
      sessionId,
      seconds,
    ]);

  /** The CPU's score exactly as a client would compute it from what was issued. */
  const opponentOf = (run: StartSessionResponse) =>
    cpuScore(cpuTimeline(run.blocks, run.cpuLevel ?? 0, BigInt(run.seed)));

  async function playedKeys(token: string, run: StartSessionResponse, keys: number) {
    await aged(run.sessionId, (keys * STEP_MS) / 1000 + 1);
    const log = correctLog(run.blocks, keys, STEP_MS);
    return { log, response: await submit(token, run.sessionId, { log }) };
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

  describe('starting a run', () => {
    it('issues the same blocks as single play would and records the level', async () => {
      const token = await signedIn();
      const run = await startCpu(token, 48);
      expect(run).toMatchObject({ mode: 'cpu', cpuLevel: 48 });
      const bundle = app.get(ContentLibrary).get('python');
      expect(run.blocks.map((block) => block.blockId)).toEqual(
        drawBlockIds(bundle?.blockIds ?? [], BigInt(run.seed)),
      );
      const [row] = await query<{ mode: string; cpu_level: number }[]>(
        'SELECT mode, cpu_level FROM issued_runs WHERE id = $1',
        [run.sessionId],
      );
      expect(row).toEqual({ mode: 'cpu', cpu_level: 48 });
    });

    it('gives a single run no level', async () => {
      const response = await start(await signedIn(), { language: 'python' });
      expect(StartSessionResponseSchema.parse(response.json())).toMatchObject({
        mode: 'single',
        cpuLevel: null,
      });
    });

    it.each([
      ['a vs CPU run without a level', { language: 'python', mode: 'cpu' }],
      ['a level of 0', { language: 'python', mode: 'cpu', cpuLevel: 0 }],
      ['a level of 101', { language: 'python', mode: 'cpu', cpuLevel: 101 }],
      ['a fractional level', { language: 'python', mode: 'cpu', cpuLevel: 1.5 }],
      ['a level on single play', { language: 'python', mode: 'single', cpuLevel: 5 }],
      ['a level with no mode', { language: 'python', cpuLevel: 5 }],
    ])('refuses %s', async (_name, payload) => {
      expect((await start(await signedIn(), payload)).statusCode).toBe(400);
    });
  });

  describe('the issued_runs constraint', () => {
    it.each([
      ['a vs CPU run with no level', 'cpu', null],
      ['a vs CPU run above level 100', 'cpu', 101],
      ['a vs CPU run at level 0', 'cpu', 0],
      ['a single run with a level', 'single', 5],
    ])('refuses %s', async (_name, mode, level) => {
      const token = await signedIn();
      const probe = await startCpu(token, 5);
      await expect(
        query(
          `INSERT INTO issued_runs (user_id, language_id, mode, cpu_level, rng_seed, content_revision, block_ids)
           SELECT user_id, language_id, $2, $3, 1, content_revision, block_ids
           FROM issued_runs WHERE id = $1`,
          [probe.sessionId, mode, level],
        ),
      ).rejects.toThrow(/chk_issued_runs_cpu_level/);
    });
  });

  describe('judging a result', () => {
    it('beats a slow CPU and stores the level, the CPU score, and the win', async () => {
      const token = await signedIn();
      const run = await startCpu(token, 1);
      const { log, response } = await playedKeys(token, run, 200);
      expect(response.statusCode).toBe(201);
      const { run: stored } = SubmitResultResponseSchema.parse(response.json());

      const playerScore = replaySession(run.blocks, log).metrics.score;
      expect(playerScore).toBeGreaterThan(opponentOf(run));
      expect(stored).toMatchObject({
        mode: 'cpu',
        cpuLevel: 1,
        opponentScore: opponentOf(run),
        result: 'win',
        score: playerScore,
      });
      const [row] = await query<
        { mode: string; cpu_level: number; opponent_score: number; result: string }[]
      >('SELECT mode, cpu_level, opponent_score, result FROM play_sessions WHERE id = $1', [
        stored.id,
      ]);
      expect(row).toEqual({
        mode: 'cpu',
        cpu_level: 1,
        opponent_score: opponentOf(run),
        result: 'win',
      });
    });

    it('loses to a fast CPU, and ignores a result the client claims', async () => {
      const token = await signedIn();
      const run = await startCpu(token, 100);
      await aged(run.sessionId, (200 * STEP_MS) / 1000 + 1);
      const response = await submit(token, run.sessionId, {
        log: correctLog(run.blocks, 200, STEP_MS),
        result: 'win',
        opponentScore: 0,
        cpuLevel: 1,
      });
      expect(response.statusCode).toBe(201);
      const { run: stored } = SubmitResultResponseSchema.parse(response.json());
      expect(stored).toMatchObject({
        cpuLevel: 100,
        opponentScore: opponentOf(run),
        result: 'lose',
      });
    });

    /**
     * A level-1 run (its CPU scores about 50, so short logs suffice) and a number of keystrokes
     * whose replayed score is `target(cpuScore)`. The engine's own insertions make a score skip
     * values for some blocks, so fresh runs are drawn until one lands exactly.
     */
    async function runScoring(token: string, offset: number) {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const run = await startCpu(token, 1);
        const wanted = opponentOf(run) + offset;
        for (let keys = 1; keys <= 400; keys += 1) {
          const score = replaySession(run.blocks, correctLog(run.blocks, keys, STEP_MS)).metrics
            .score;
          if (score === wanted) return { run, keys };
          if (score > wanted) break;
        }
      }
      throw new Error('no run drew blocks whose score can land on the CPU score');
    }

    it('counts a tie as a win', async () => {
      const token = await signedIn();
      const { run, keys } = await runScoring(token, 0);
      const { response } = await playedKeys(token, run, keys);
      const { run: stored } = SubmitResultResponseSchema.parse(response.json());
      expect(stored.score).toBe(opponentOf(run));
      expect(stored).toMatchObject({ opponentScore: opponentOf(run), result: 'win' });
    });

    it('counts one point short of the CPU as a loss', async () => {
      const token = await signedIn();
      const { run, keys } = await runScoring(token, -1);
      const { response } = await playedKeys(token, run, keys);
      const { run: stored } = SubmitResultResponseSchema.parse(response.json());
      expect(stored.score).toBe(opponentOf(run) - 1);
      expect(stored).toMatchObject({ opponentScore: opponentOf(run), result: 'lose' });
    });

    it('stores single play with no opponent, level, or result', async () => {
      const token = await signedIn();
      const issued = StartSessionResponseSchema.parse(
        (await start(token, { language: 'python' })).json(),
      );
      const { response } = await playedKeys(token, issued, 100);
      const { run: stored } = SubmitResultResponseSchema.parse(response.json());
      expect(stored).toMatchObject({
        mode: 'single',
        cpuLevel: null,
        opponentScore: null,
        result: null,
      });
    });
  });
});
