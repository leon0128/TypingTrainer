import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  AuthResponseSchema,
  RatingsResponseSchema,
  countMaxKeystrokes,
  StartSessionResponseSchema,
  SubmitResultResponseSchema,
  poolKindOf,
  trackOf,
  type ContentLanguage,
  type StartSessionResponse,
} from '@typing-trainer/contracts';
import { cpuScore, cpuTimeline, drawBlockIds, runBlockCount } from '@typing-trainer/typing-engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { ContentLibrary } from '../src/modules/content/content-library';
import { PLAUSIBILITY_LIMITS } from '../src/modules/play/plausibility-limits';
import { TEST_APP_ORIGIN, testEnv } from './support/env';
import { canonicalKeys, logOf, longestKeys } from './support/play-log';
import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

const PASSWORD = 'correct horse battery staple';
const COOKIE = 'tt_session';
const POOLS = ['en-word', 'en-line', 'en-paragraph', 'ja-word', 'ja-line', 'ja-paragraph'] as const;

let counter = 0;
const nextUsername = () => `natural${String((counter += 1))}`;
const nextAddress = () => `198.51.100.${String((counter += 1) % 250)}`;

/**
 * Runs of the natural-language pools (§13.7): the blocks a run takes, the opponent's and the
 * limits' dependence on the track, and Japanese spelled the longest way. The pools are disabled in
 * production until the web can show them, so the test database turns them on.
 */
describe.runIf(TEST_DATABASE_URL !== undefined)('natural-language runs (TEST_DATABASE_URL)', () => {
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
    const { user } = AuthResponseSchema.parse(response.json());
    // Japanese is only for accounts whose display language is Japanese (§13.11).
    await query(`UPDATE users SET locale = 'ja' WHERE id = $1`, [user.id]);
    return response.cookies.find((cookie) => cookie.name === COOKIE)?.value ?? '';
  }

  const start = (token: string, payload: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/api/play/sessions',
      headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${token}` },
      payload,
    });

  async function issue(token: string, payload: Record<string, unknown>) {
    const response = await start(token, payload);
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

  async function play(token: string, run: StartSessionResponse, keys: string[], stepMs: number) {
    await aged(run.sessionId, (keys.length * stepMs) / 1000 + 1);
    return submit(token, run.sessionId, { log: logOf(keys, stepMs) });
  }

  beforeAll(async () => {
    database = await createTestDatabase(TEST_DATABASE_URL ?? '');
    await query(`UPDATE languages SET enabled = true WHERE track <> 'code'`);
    app = await createApp(testEnv({ DATABASE_URL: database.url, REGISTRATION_DAILY_LIMIT: '500' }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await database.drop();
  });

  describe.each(POOLS)('a run of %s', (pool) => {
    const kind = poolKindOf(pool);
    const count = runBlockCount(kind);

    it('takes the blocks a run of its kind takes, drawn from its pool, and records them', async () => {
      const token = await signedIn();
      const run = await issue(token, { language: pool, mode: 'single' });
      const bundle = app.get(ContentLibrary).get(pool);
      expect(run.blocks).toHaveLength(count);
      expect(run.blocks.map((block) => block.blockId)).toEqual(
        drawBlockIds(bundle?.blockIds ?? [], BigInt(run.seed), count),
      );
      expect(new Set(run.blocks.map((block) => block.blockId)).size).toBe(count);
      expect(run.contentRevision).toBe(bundle?.revision);
      for (const block of run.blocks) expect(block).toEqual(bundle?.programs.get(block.blockId));
      const [row] = await query<{ blocks: number }[]>(
        'SELECT cardinality(block_ids)::int AS blocks FROM issued_runs WHERE id = $1',
        [run.sessionId],
      );
      expect(row?.blocks).toBe(count);
    });
  });

  it('takes 300 words, 80 sentences, and 20 paragraphs, and 20 blocks of code', async () => {
    const token = await signedIn();
    const sizes: Record<string, number> = {};
    for (const language of ['en-word', 'en-line', 'en-paragraph', 'python']) {
      sizes[language] = (await issue(token, { language, mode: 'single' })).blocks.length;
    }
    expect(sizes).toEqual({ 'en-word': 300, 'en-line': 80, 'en-paragraph': 20, python: 20 });
  });

  describe('the speed limits follow the track', () => {
    // A burst of keys in under ten seconds. At 20 ms a key, 450 keys are 2,700 keys a minute in a
    // ten-second window: over the limit of code, under the limit of prose.
    const CODE_PEAK = PLAUSIBILITY_LIMITS.code.maxPeakKpm10s;
    const PROSE_PEAK = PLAUSIBILITY_LIMITS['natural-en'].maxPeakKpm10s;
    const BURST_KEYS = 450;
    const BURST_STEP_MS = 20;
    const KPM = (keys: number) => keys * 6;
    const keysOf = (blocks: StartSessionResponse['blocks'], count: number) =>
      blocks.flatMap(canonicalKeys).slice(0, count);

    it('has a burst between the two limits', () => {
      expect(KPM(BURST_KEYS)).toBeGreaterThan(CODE_PEAK);
      expect(KPM(BURST_KEYS)).toBeLessThan(PROSE_PEAK);
    });

    it('accepts, for prose, a burst that code would refuse', async () => {
      const token = await signedIn();
      const run = await issue(token, { language: 'en-word', mode: 'single' });
      const response = await play(token, run, keysOf(run.blocks, BURST_KEYS), BURST_STEP_MS);
      expect(response.statusCode).toBe(201);
      SubmitResultResponseSchema.parse(response.json());
    });

    it('refuses the same burst in code', async () => {
      const token = await signedIn();
      const run = await issue(token, { language: 'python', mode: 'single' });
      const response = await play(token, run, keysOf(run.blocks, BURST_KEYS), BURST_STEP_MS);
      expect(response.statusCode).toBe(422);
    });

    it('refuses, for prose too, a burst past its own limit', async () => {
      const token = await signedIn();
      const run = await issue(token, { language: 'en-word', mode: 'single' });
      const keys = 600; // 3,600 keys a minute in ten seconds, at 10 ms a key
      expect(KPM(keys)).toBeGreaterThan(PROSE_PEAK);
      const response = await play(token, run, keysOf(run.blocks, keys), 10);
      expect(response.statusCode).toBe(422);
    });
  });

  describe('Japanese, spelled the longest way', () => {
    it('is accepted although it passes the shortest total, and counts every key', async () => {
      const token = await signedIn();
      const run = await issue(token, { language: 'ja-word', mode: 'single' });
      const blocks = run.blocks.slice(0, 40);
      const keys = blocks.flatMap(longestKeys);
      const shortest = blocks.flatMap(canonicalKeys).length;
      expect(keys.length).toBeGreaterThan(shortest);
      const response = await play(token, run, keys, 200);
      expect(response.statusCode).toBe(201);
      const stored = SubmitResultResponseSchema.parse(response.json()).run;
      expect(stored.effectiveKeystrokes).toBe(keys.length);
      expect(stored.missCount).toBe(0);
      expect(keys.length).toBeLessThanOrEqual(
        blocks.reduce((sum, block) => sum + countMaxKeystrokes(block.atoms), 0),
      );
    });
  });

  describe('vs CPU in a natural-language pool', () => {
    it('judges by the track: the CPU of prose is faster than the same level of code', async () => {
      const token = await signedIn();
      const run = await issue(token, { language: 'en-line', mode: 'cpu', cpuLevel: 40 });
      expect(trackOf(run.language)).toBe('natural-en');
      const keys = run.blocks.flatMap(canonicalKeys).slice(0, 300);
      const response = await play(token, run, keys, 60);
      expect(response.statusCode).toBe(201);
      const { run: stored, rating } = SubmitResultResponseSchema.parse(response.json());
      const expected = cpuScore(cpuTimeline(run.blocks, 40, BigInt(run.seed), 'natural-en'));
      const asCode = cpuScore(cpuTimeline(run.blocks, 40, BigInt(run.seed), 'code'));
      expect(stored.opponentScore).toBe(expected);
      expect(expected).toBeGreaterThan(asCode);
      expect(rating?.language).toBe('en-line');
    });

    it('rates each pool as its own language, from its own matches', async () => {
      const token = await signedIn();
      for (const language of ['en-word', 'ja-line'] as ContentLanguage[]) {
        const run = await issue(token, { language, mode: 'cpu', cpuLevel: 1 });
        const keys = run.blocks.flatMap(canonicalKeys).slice(0, 200);
        expect((await play(token, run, keys, 40)).statusCode).toBe(201);
      }
      const response = await app.inject({
        method: 'GET',
        url: '/api/ratings',
        headers: { cookie: `${COOKIE}=${token}` },
      });
      const played = Object.fromEntries(
        RatingsResponseSchema.parse(response.json()).languages.map((entry) => [
          entry.language,
          entry.gamesPlayed,
        ]),
      );
      expect(played).toMatchObject({
        'en-word': 1,
        'ja-line': 1,
        'en-line': 0,
        'ja-word': 0,
        python: 0,
      });
    });
  });

  describe('a Ghost in a natural-language pool', () => {
    it('reproduces the best of the same pool', async () => {
      const token = await signedIn();
      const first = await issue(token, { language: 'en-paragraph', mode: 'single' });
      const keys = first.blocks.flatMap(canonicalKeys).slice(0, 240);
      const stored = SubmitResultResponseSchema.parse(
        (await play(token, first, keys, 100)).json(),
      ).run;
      const ghost = await issue(token, {
        language: 'en-paragraph',
        mode: 'ghost',
        ghostPeriod: 'total',
      });
      expect(ghost.ghostScore).toBe(stored.score);
      expect(ghost.blocks).toHaveLength(runBlockCount('paragraph'));
    });
  });
});
