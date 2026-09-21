import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  AuthResponseSchema,
  RatingsResponseSchema,
  StartSessionResponseSchema,
  SubmitResultResponseSchema,
  type StartSessionResponse,
} from '@typing-trainer/contracts';
import { ratingDelta } from '@typing-trainer/typing-engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { TEST_APP_ORIGIN, testEnv } from './support/env';
import { correctLog } from './support/play-log';
import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

const PASSWORD = 'correct horse battery staple';
const COOKIE = 'tt_session';
const STEP_MS = 50;
/** Enough correct keystrokes to beat a level-1 CPU (its score is about 50). */
const WINNING_KEYS = 200;

let counter = 0;
const nextUsername = () => `rated${String((counter += 1))}`;
const nextAddress = () => `203.0.113.${String((counter += 1) % 250)}`;

describe.runIf(TEST_DATABASE_URL !== undefined)('ratings (TEST_DATABASE_URL)', () => {
  let database: TestDatabase;
  let app: NestFastifyApplication;

  const query = <T>(sql: string, parameters: unknown[] = []) =>
    database.dataSource.query<T>(sql, parameters);

  interface Player {
    readonly id: string;
    readonly token: string;
  }

  async function signedIn(): Promise<Player> {
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

  const headers = (token: string) => ({
    origin: TEST_APP_ORIGIN,
    cookie: `${COOKIE}=${token}`,
  });

  async function startRun(
    player: Player,
    payload: Record<string, unknown>,
  ): Promise<StartSessionResponse> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/play/sessions',
      headers: headers(player.token),
      payload,
    });
    expect(response.statusCode).toBe(201);
    return StartSessionResponseSchema.parse(response.json());
  }

  const startCpu = (player: Player, cpuLevel: number) =>
    startRun(player, { language: 'python', mode: 'cpu', cpuLevel });

  const submit = (player: Player, sessionId: string, body: unknown) =>
    app.inject({
      method: 'POST',
      url: `/api/play/sessions/${sessionId}/result`,
      headers: headers(player.token),
      payload: body as Record<string, unknown>,
    });

  /** Plays `keys` correct keystrokes; back-dates the issue so the log fits the wall clock. */
  async function play(player: Player, run: StartSessionResponse, keys: number) {
    await query(
      'UPDATE issued_runs SET issued_at = now() - make_interval(secs => $2) WHERE id = $1',
      [run.sessionId, (keys * STEP_MS) / 1000 + 1],
    );
    return submit(player, run.sessionId, { log: correctLog(run.blocks, keys, STEP_MS) });
  }

  async function pythonRating(player: Player) {
    const response = await app.inject({
      method: 'GET',
      url: '/api/ratings',
      headers: headers(player.token),
    });
    expect(response.statusCode).toBe(200);
    return RatingsResponseSchema.parse(response.json()).languages.find(
      (entry) => entry.language === 'python',
    );
  }

  /** Gives the player an established rating in python without playing for it. */
  async function rated(player: Player, rating: number, gamesPlayed: number) {
    await query(
      `INSERT INTO language_ratings (user_id, language_id, rating, games_played)
       SELECT $1, id, $2, $3 FROM programming_languages WHERE slug = 'python'`,
      [player.id, rating, gamesPlayed],
    );
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

  describe('GET /api/ratings', () => {
    it('needs a session', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/ratings' });
      expect(response.statusCode).toBe(401);
    });

    it('rates every language 0 for a player who has raced nobody', async () => {
      const player = await signedIn();
      const response = await app.inject({
        method: 'GET',
        url: '/api/ratings',
        headers: headers(player.token),
      });
      const { languages } = RatingsResponseSchema.parse(response.json());
      expect(languages.length).toBeGreaterThan(0);
      for (const entry of languages) {
        expect(entry.displayName).not.toBe('');
        expect(entry).toMatchObject({ rating: 0, gamesPlayed: 0 });
      }
    });

    it("never shows another player's rating", async () => {
      const other = await signedIn();
      await rated(other, 900, 30);
      expect(await pythonRating(await signedIn())).toMatchObject({ rating: 0, gamesPlayed: 0 });
    });
  });

  describe('a vs CPU run', () => {
    it('is charged as a loss the moment it is issued, and unfinished it stays one', async () => {
      const player = await signedIn();
      await rated(player, 1000, 20);
      await startCpu(player, 50);
      const charge = ratingDelta({ rating: 1000, gamesPlayed: 20, cpuLevel: 50, won: false });
      expect(charge).toBeLessThan(0);
      expect(await pythonRating(player)).toMatchObject({ rating: 1000 + charge, gamesPlayed: 21 });
    });

    it('is a win worth its own points once a winning result is submitted', async () => {
      const player = await signedIn();
      const run = await startCpu(player, 1);
      // At 0 a loss costs nothing, so the charge leaves the rating where it was.
      expect(await pythonRating(player)).toMatchObject({ rating: 0, gamesPlayed: 1 });

      const response = await play(player, run, WINNING_KEYS);
      expect(response.statusCode).toBe(201);
      const body = SubmitResultResponseSchema.parse(response.json());
      const win = ratingDelta({ rating: 0, gamesPlayed: 0, cpuLevel: 1, won: true });
      expect(body.run.result).toBe('win');
      expect(body.rating).toMatchObject({ language: 'python', before: 0, after: win });
      expect(body.rating?.languages.find((entry) => entry.language === 'python')).toMatchObject({
        rating: win,
        gamesPlayed: 1,
      });
      expect(await pythonRating(player)).toMatchObject({ rating: win, gamesPlayed: 1 });
    });

    it('keeps the loss when the result is a loss', async () => {
      const player = await signedIn();
      await rated(player, 1000, 20);
      const run = await startCpu(player, 100);
      const response = await play(player, run, WINNING_KEYS);
      const body = SubmitResultResponseSchema.parse(response.json());
      expect(body.run.result).toBe('lose');
      const loss = ratingDelta({ rating: 1000, gamesPlayed: 20, cpuLevel: 100, won: false });
      expect(body.rating).toMatchObject({ before: 1000, after: 1000 + loss });
      expect(await pythonRating(player)).toMatchObject({ rating: 1000 + loss, gamesPlayed: 21 });
    });

    it('is a loss when the submitted log holds no keystroke', async () => {
      const player = await signedIn();
      await rated(player, 1000, 20);
      const run = await startCpu(player, 50);
      const response = await submit(player, run.sessionId, {
        log: { version: 1, keys: '', deltas: [] },
      });
      expect(response.statusCode).toBe(204);
      const loss = ratingDelta({ rating: 1000, gamesPlayed: 20, cpuLevel: 50, won: false });
      expect(await pythonRating(player)).toMatchObject({ rating: 1000 + loss, gamesPlayed: 21 });
    });

    it('is a loss when the result is rejected as implausible, and cannot be retried', async () => {
      const player = await signedIn();
      await rated(player, 1000, 20);
      const run = await startCpu(player, 1);
      // Submitted at once, so 200 keystrokes cannot have taken the time the log claims.
      const response = await submit(player, run.sessionId, {
        log: correctLog(run.blocks, WINNING_KEYS, STEP_MS),
      });
      expect(response.statusCode).toBe(422);
      const loss = ratingDelta({ rating: 1000, gamesPlayed: 20, cpuLevel: 1, won: false });
      expect(await pythonRating(player)).toMatchObject({ rating: 1000 + loss, gamesPlayed: 21 });
      expect((await play(player, run, WINNING_KEYS)).statusCode).toBe(409);
    });

    it('gives the points back when the content changed under the run', async () => {
      const player = await signedIn();
      await rated(player, 1000, 20);
      const run = await startCpu(player, 50);
      await query('UPDATE issued_runs SET content_revision = $2 WHERE id = $1', [
        run.sessionId,
        'f'.repeat(64),
      ]);
      expect((await play(player, run, WINNING_KEYS)).statusCode).toBe(409);
      expect(await pythonRating(player)).toMatchObject({ rating: 1000, gamesPlayed: 20 });
    });

    it('is worth the same when runs overlap, whatever order they finish in', async () => {
      const player = await signedIn();
      await rated(player, 1000, 20);
      const first = await startCpu(player, 1);
      const second = await startCpu(player, 1);
      const win = ratingDelta({ rating: 1000, gamesPlayed: 20, cpuLevel: 1, won: true });
      const later = ratingDelta({ rating: 1000, gamesPlayed: 21, cpuLevel: 1, won: true });

      await play(player, second, WINNING_KEYS);
      await play(player, first, WINNING_KEYS);
      // Each win is worth what it was worth when its run was issued: the second run started with
      // the first already counted as a match.
      expect(await pythonRating(player)).toMatchObject({
        rating: 1000 + win + later,
        gamesPlayed: 22,
      });
    });

    it('is not rated when it was issued before ratings existed', async () => {
      const player = await signedIn();
      const run = await startCpu(player, 1);
      await query(
        'UPDATE issued_runs SET rating_before = NULL, games_before = NULL, rating_charged = NULL WHERE id = $1',
        [run.sessionId],
      );
      await query('DELETE FROM language_ratings WHERE user_id = $1', [player.id]);
      const response = await play(player, run, WINNING_KEYS);
      expect(SubmitResultResponseSchema.parse(response.json()).rating).toBeNull();
      expect(await pythonRating(player)).toMatchObject({ rating: 0, gamesPlayed: 0 });
    });
  });

  describe('other modes', () => {
    it('leave the rating alone and report none', async () => {
      const player = await signedIn();
      await rated(player, 700, 15);
      const run = await startRun(player, { language: 'python' });
      const response = await play(player, run, 100);
      expect(response.statusCode).toBe(201);
      expect(SubmitResultResponseSchema.parse(response.json()).rating).toBeNull();
      expect(await pythonRating(player)).toMatchObject({ rating: 700, gamesPlayed: 15 });
    });
  });

  describe('the language_ratings constraints', () => {
    it.each([
      ['a negative rating', -1, 0],
      ['a rating above 2000', 2001, 0],
      ['a negative match count', 0, -1],
    ])('refuse %s', async (_name, rating, games) => {
      const player = await signedIn();
      await expect(rated(player, rating, games)).rejects.toThrow(/chk_language_ratings/);
    });
  });
});
