import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ApiErrorSchema,
  StartSessionResponseSchema,
  type StartSessionResponse,
} from '@typing-trainer/contracts';
import { RUN_BLOCK_COUNT, drawBlockIds } from '@typing-trainer/typing-engine';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { ContentLibrary } from '../src/modules/content/content-library';
import { IssuedRunsRepository } from '../src/modules/play/issued-runs.repository';
import { ISSUE_LIMIT_PER_USER } from '../src/modules/play/play.constants';
import { TEST_APP_ORIGIN, testEnv } from './support/env';
import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

const PASSWORD = 'correct horse battery staple';
const COOKIE = 'tt_session';

let counter = 0;
const nextUsername = () => `player${String((counter += 1))}`;

let addressCounter = 0;
/** A fresh client address per player, so the per-address registration limit never interferes. */
const nextAddress = () => `203.0.113.${String((addressCounter += 1))}`;

describe.runIf(TEST_DATABASE_URL !== undefined)(
  'POST /api/play/sessions (TEST_DATABASE_URL)',
  () => {
    let database: TestDatabase;
    let app: NestFastifyApplication;

    const query = <T>(sql: string, parameters: unknown[] = []) =>
      database.dataSource.query<T>(sql, parameters);

    /** Registers a user and returns their session token. */
    async function signedIn(): Promise<string> {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        remoteAddress: nextAddress(),
        headers: { origin: TEST_APP_ORIGIN },
        payload: { username: nextUsername(), password: PASSWORD },
      });
      expect(response.statusCode).toBe(201);
      return response.cookies.find((cookie) => cookie.name === COOKIE)?.value ?? '';
    }

    const startRun = (token: string | undefined, payload: object = { language: 'python' }) =>
      app.inject({
        method: 'POST',
        url: '/api/play/sessions',
        headers: {
          origin: TEST_APP_ORIGIN,
          ...(token === undefined ? {} : { cookie: `${COOKIE}=${token}` }),
        },
        payload,
      });

    const issued = (response: LightMyRequestResponse): StartSessionResponse => {
      expect(response.statusCode).toBe(201);
      return StartSessionResponseSchema.parse(response.json());
    };

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

    it('requires a session', async () => {
      const response = await startRun(undefined);
      expect(response.statusCode).toBe(401);
      expect(ApiErrorSchema.parse(response.json()).message).toBe('authentication required');
    });

    it('issues twenty blocks drawn from the language pool with the run seed', async () => {
      const run = issued(await startRun(await signedIn()));
      const bundle = app.get(ContentLibrary).get('python');
      expect(run).toMatchObject({ language: 'python', mode: 'single', durationMs: 120_000 });
      expect(run.contentRevision).toBe(bundle?.revision);
      expect(run.blocks).toHaveLength(RUN_BLOCK_COUNT);
      expect(run.blocks.map((block) => block.blockId)).toEqual(
        drawBlockIds(bundle?.blockIds ?? [], BigInt(run.seed)),
      );
      for (const block of run.blocks) {
        expect(block).toEqual(bundle?.programs.get(block.blockId));
      }
    });

    it('records what it issued, unsubmitted, for the signed-in user', async () => {
      const token = await signedIn();
      const run = issued(await startRun(token));
      const [row] = await query<
        {
          user_id: string;
          mode: string;
          rng_seed: string;
          content_revision: string;
          block_ids: string[];
          submitted_at: Date | null;
        }[]
      >('SELECT * FROM issued_runs WHERE id = $1', [run.sessionId]);
      expect(row).toMatchObject({
        mode: 'single',
        rng_seed: run.seed,
        content_revision: run.contentRevision,
        block_ids: run.blocks.map((block) => block.blockId),
        submitted_at: null,
      });
      const me = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: `${COOKIE}=${token}` },
      });
      expect(row?.user_id).toBe(me.json<{ user: { id: string } }>().user.id);
    });

    it('draws a different sequence for each run', async () => {
      const token = await signedIn();
      const first = issued(await startRun(token));
      const second = issued(await startRun(token));
      expect(second.seed).not.toBe(first.seed);
      expect(second.sessionId).not.toBe(first.sessionId);
    });

    it('refuses a language that is unknown, disabled, or a mode P1 does not play', async () => {
      const token = await signedIn();
      expect((await startRun(token, { language: 'rust' })).statusCode).toBe(400);
      expect((await startRun(token, { language: 'python', mode: 'cpu' })).statusCode).toBe(400);

      await query(`UPDATE programming_languages SET enabled = false WHERE slug = 'go'`);
      const disabled = await startRun(token, { language: 'go' });
      expect(disabled.statusCode).toBe(404);
      expect(ApiErrorSchema.parse(disabled.json()).message).toBe('language "go" is not available');
      await query(`UPDATE programming_languages SET enabled = true WHERE slug = 'go'`);
      const [{ count } = { count: '' }] = await query<{ count: string }[]>(
        `SELECT count(*) FROM issued_runs r JOIN programming_languages l ON l.id = r.language_id
       WHERE l.slug = 'go'`,
      );
      expect(count).toBe('0');
    });

    it('limits how many runs one user may start in an hour', async () => {
      const token = await signedIn();
      for (let run = 0; run < ISSUE_LIMIT_PER_USER; run += 1) {
        expect((await startRun(token)).statusCode).toBe(201);
      }
      const refused = await startRun(token);
      expect(refused.statusCode).toBe(429);
      expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
      // The limit is per user, so another player is unaffected.
      expect((await startRun(await signedIn())).statusCode).toBe(201);
    });

    it('deletes issued runs a day after they were issued', async () => {
      const token = await signedIn();
      const fresh = issued(await startRun(token));
      const stale = issued(await startRun(token));
      await query(`UPDATE issued_runs SET issued_at = now() - interval '25 hours' WHERE id = $1`, [
        stale.sessionId,
      ]);
      // Exactly the stale one: the count comes from the rows the statement returned.
      expect(await app.get(IssuedRunsRepository).deleteStale()).toBe(1);
      const ids = (await query<{ id: string }[]>('SELECT id FROM issued_runs')).map(
        (row) => row.id,
      );
      expect(ids).toContain(fresh.sessionId);
      expect(ids).not.toContain(stale.sessionId);
    });
  },
);
