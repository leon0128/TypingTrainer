import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  AuthResponseSchema,
  ConquestsResponseSchema,
  DashboardResponseSchema,
  GhostRecordsResponseSchema,
  HistoryResponseSchema,
  LanguagesResponseSchema,
  RatingsResponseSchema,
  StartSessionResponseSchema,
  trackOf,
  type StartSessionResponse,
} from '@typing-trainer/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { TEST_APP_ORIGIN, testEnv } from './support/env';
import { canonicalKeys, logOf } from './support/play-log';
import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

const PASSWORD = 'correct horse battery staple';
const COOKIE = 'tt_session';

let counter = 0;

/**
 * Japanese is for accounts whose display language is Japanese (§13.11). One account plays Japanese,
 * then changes its display language and back, and every endpoint is read in each state: nothing of
 * Japanese is listed or added up, a request that names a Japanese pool is refused with 403, and
 * nothing is deleted, so it all comes back.
 */
describe.runIf(TEST_DATABASE_URL !== undefined)(
  'the Japanese track and display language (TEST_DATABASE_URL)',
  () => {
    let database: TestDatabase;
    let app: NestFastifyApplication;
    let token = '';
    let userId = '';

    const query = <T>(sql: string, parameters: unknown[] = []) =>
      database.dataSource.query<T>(sql, parameters);
    const setLocale = (locale: string) =>
      query(`UPDATE users SET locale = $2 WHERE id = $1`, [userId, locale]);

    const call = (
      method: 'GET' | 'POST' | 'DELETE',
      url: string,
      payload?: Record<string, unknown>,
    ) =>
      app.inject({
        method,
        url,
        headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${token}` },
        ...(payload === undefined ? {} : { payload }),
      });

    async function register(): Promise<{ token: string; id: string }> {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        remoteAddress: `203.0.113.${String((counter += 1) % 250)}`,
        headers: { origin: TEST_APP_ORIGIN },
        payload: { username: `gated${String(counter)}`, password: PASSWORD },
      });
      expect(response.statusCode).toBe(201);
      return {
        token: response.cookies.find((cookie) => cookie.name === COOKIE)?.value ?? '',
        id: AuthResponseSchema.parse(response.json()).user.id,
      };
    }

    async function issue(payload: Record<string, unknown>): Promise<StartSessionResponse> {
      const response = await call('POST', '/api/play/sessions', payload);
      expect(response.statusCode).toBe(201);
      return StartSessionResponseSchema.parse(response.json());
    }

    /** Types the first `count` keys of the blocks and submits, after back-dating the issue. */
    async function submit(run: StartSessionResponse, count: number) {
      const keys = run.blocks.flatMap(canonicalKeys).slice(0, count);
      await query(
        'UPDATE issued_runs SET issued_at = now() - make_interval(secs => $2) WHERE id = $1',
        [run.sessionId, (keys.length * 50) / 1000 + 1],
      );
      return call('POST', `/api/play/sessions/${run.sessionId}/result`, { log: logOf(keys, 50) });
    }

    const slugs = (entries: readonly { language: string }[]) =>
      entries.map((entry) => entry.language);
    const isJapanese = (language: string) => trackOf(language as never) === 'natural-ja';

    beforeAll(async () => {
      database = await createTestDatabase(TEST_DATABASE_URL ?? '');
      app = await createApp(
        testEnv({ DATABASE_URL: database.url, REGISTRATION_DAILY_LIMIT: '500' }),
      );
      await app.init();
      await app.getHttpAdapter().getInstance().ready();

      ({ token, id: userId } = await register());
      await setLocale('ja');
      // A single run and a vs CPU win in Japanese, one of each in English and in code, so every list
      // and total has something of each track to show or to hide.
      for (const [language, mode] of [
        ['ja-word', 'single'],
        ['ja-word', 'cpu'],
        ['en-word', 'single'],
        ['python', 'single'],
      ] as const) {
        const run = await issue(
          mode === 'cpu' ? { language, mode, cpuLevel: 1 } : { language, mode },
        );
        const response = await submit(run, 200);
        expect(response.statusCode, `${language} ${mode}`).toBe(201);
      }
    });

    afterAll(async () => {
      await app.close();
      await database.drop();
    });

    describe('for an account whose display language is Japanese', () => {
      it('lists, rates, and counts the Japanese track like any other', async () => {
        await setLocale('ja');
        const languages = LanguagesResponseSchema.parse(
          (await call('GET', '/api/languages')).json(),
        );
        expect(languages.languages.map((l) => l.slug)).toEqual([
          'typescript',
          'go',
          'java',
          'python',
          'ja-word',
          'ja-line',
          'ja-paragraph',
          'en-word',
          'en-line',
          'en-paragraph',
        ]);
        const ratings = RatingsResponseSchema.parse((await call('GET', '/api/ratings')).json());
        expect(ratings.languages.filter((l) => isJapanese(l.language))).toHaveLength(3);
        expect(ratings.languages.find((l) => l.language === 'ja-word')?.gamesPlayed).toBe(1);
        const history = HistoryResponseSchema.parse((await call('GET', '/api/history')).json());
        expect(history.total).toBe(4);
        expect(history.entries.some((entry) => isJapanese(entry.language))).toBe(true);
        const conquests = ConquestsResponseSchema.parse(
          (await call('GET', '/api/cpu-conquests')).json(),
        );
        expect(conquests.languages.find((l) => l.language === 'ja-word')?.beatenLevels).toEqual([
          1,
        ]);
      });
    });

    describe('a track on its own (§13.9)', () => {
      const history = async (search: string) =>
        HistoryResponseSchema.parse((await call('GET', `/api/history${search}`)).json());
      const summary = async (language: string) =>
        DashboardResponseSchema.parse(
          (await call('GET', `/api/dashboard?period=total&language=${language}`)).json(),
        ).summary;

      it('lists the history of one track, and the tracks add up to all of it', async () => {
        await setLocale('ja');
        const code = await history('?track=code');
        const japanese = await history('?track=natural-ja');
        const english = await history('?track=natural-en');
        expect(code.entries.map((entry) => entry.language)).toEqual(['python']);
        expect(japanese.entries.map((entry) => entry.language)).toEqual(['ja-word', 'ja-word']);
        expect(english.entries.map((entry) => entry.language)).toEqual(['en-word']);
        expect([code.total, japanese.total, english.total]).toEqual([1, 2, 1]);
        expect((await history('')).total).toBe(4);
      });

      it('keeps the language filter inside the track, and refuses a language of another track', async () => {
        await setLocale('ja');
        expect((await history('?track=natural-ja&language=ja-word')).total).toBe(2);
        const response = await call('GET', '/api/history?track=natural-en&language=ja-word');
        expect(response.statusCode).toBe(400);
      });

      it('adds up the dashboard summary within the track of the language shown', async () => {
        await setLocale('ja');
        const japanese = await summary('ja-word');
        expect(japanese.totalRuns).toBe(2);
        expect(japanese.bestScores.map((entry) => entry.language)).toEqual(['ja-word']);
        expect(japanese.highestCpuLevelBeaten).toBe(1);
        const code = await summary('python');
        expect(code.totalRuns).toBe(1);
        expect(code.bestScores.map((entry) => entry.language)).toEqual(['python']);
        expect(code.highestCpuLevelBeaten).toBeNull();
        expect((await summary('en-word')).totalRuns).toBe(1);
      });
    });

    describe('for an account whose display language is not Japanese', () => {
      it('does not list a Japanese pool', async () => {
        await setLocale('en');
        const response = await call('GET', '/api/languages');
        const list = LanguagesResponseSchema.parse(response.json()).languages;
        expect(list.filter((l) => l.track === 'natural-ja')).toEqual([]);
        expect(list.map((l) => l.slug)).toEqual([
          'typescript',
          'go',
          'java',
          'python',
          'en-word',
          'en-line',
          'en-paragraph',
        ]);
      });

      it('does not rate, record, or list conquests of a Japanese pool', async () => {
        await setLocale('en');
        const ratings = RatingsResponseSchema.parse((await call('GET', '/api/ratings')).json());
        expect(slugs(ratings.languages.map((l) => ({ language: l.language })))).not.toContain(
          'ja-word',
        );
        expect(ratings.languages.filter((l) => isJapanese(l.language))).toEqual([]);
        const records = GhostRecordsResponseSchema.parse(
          (await call('GET', '/api/ghost-records')).json(),
        );
        expect(records.languages.filter((l) => isJapanese(l.language))).toEqual([]);
        expect(records.languages.map((l) => l.language)).toContain('en-word');
        const conquests = ConquestsResponseSchema.parse(
          (await call('GET', '/api/cpu-conquests')).json(),
        );
        expect(conquests.languages.filter((l) => isJapanese(l.language))).toEqual([]);
      });

      it('does not list or count Japanese runs in the history', async () => {
        await setLocale('en');
        const history = HistoryResponseSchema.parse((await call('GET', '/api/history')).json());
        expect(history.total).toBe(2);
        expect(history.entries.filter((entry) => isJapanese(entry.language))).toEqual([]);
        expect(history.entries.map((entry) => entry.language).sort()).toEqual([
          'en-word',
          'python',
        ]);
      });

      it('does not add Japanese into the dashboard summary', async () => {
        await setLocale('en');
        const dashboard = DashboardResponseSchema.parse(
          (await call('GET', '/api/dashboard?period=total&language=python')).json(),
        );
        // The summary is that of the track of the language shown (§13.9): code has one run.
        expect(dashboard.summary.totalRuns).toBe(1);
        expect(dashboard.summary.bestScores.map((entry) => entry.language)).toEqual(['python']);
        // The only vs CPU win was in Japanese, so for this account there is none.
        expect(dashboard.summary.highestCpuLevelBeaten).toBeNull();
      });

      it('refuses the history of the Japanese track with 403', async () => {
        await setLocale('en');
        const response = await call('GET', '/api/history?track=natural-ja');
        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({
          message: expect.stringMatching(/is not available for this account/) as string,
        });
      });

      it.each([
        [
          'a run of a Japanese pool',
          'POST',
          '/api/play/sessions',
          { language: 'ja-word', mode: 'single' },
        ],
        [
          'a vs CPU run',
          'POST',
          '/api/play/sessions',
          { language: 'ja-line', mode: 'cpu', cpuLevel: 5 },
        ],
        ['the rankings', 'GET', '/api/rankings?period=total&language=ja-word', undefined],
        ['the dashboard', 'GET', '/api/dashboard?period=total&language=ja-paragraph', undefined],
        ['the history of a pool', 'GET', '/api/history?language=ja-word', undefined],
      ] as const)('refuses %s with 403', async (_what, method, url, payload) => {
        await setLocale('en');
        const response = await call(method, url, payload);
        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({
          message: expect.stringMatching(/is not available for this account/) as string,
        });
      });

      it('still serves English and code as before', async () => {
        await setLocale('en');
        expect(
          (await call('POST', '/api/play/sessions', { language: 'en-word', mode: 'single' }))
            .statusCode,
        ).toBe(201);
        expect((await call('GET', '/api/rankings?period=total&language=en-word')).statusCode).toBe(
          200,
        );
        expect((await call('GET', '/api/dashboard?period=total&language=python')).statusCode).toBe(
          200,
        );
      });

      it('answers a pool that is not enabled with the same error whatever the account, before 403', async () => {
        await query(`UPDATE languages SET enabled = false WHERE slug = 'ja-line'`);
        try {
          for (const locale of ['ja', 'en']) {
            await setLocale(locale);
            const response = await call('POST', '/api/play/sessions', {
              language: 'ja-line',
              mode: 'single',
            });
            expect(response.statusCode, locale).toBe(404);
          }
        } finally {
          await query(`UPDATE languages SET enabled = true WHERE slug = 'ja-line'`);
        }
      });

      it('lets the account delete its own run, without showing what it was', async () => {
        await setLocale('ja');
        const history = HistoryResponseSchema.parse(
          (await call('GET', '/api/history?language=ja-word')).json(),
        );
        const [single] = history.entries.filter((entry) => entry.mode === 'single');
        expect(single).toBeDefined();
        await setLocale('en');
        const response = await call('DELETE', `/api/history/${single?.id ?? ''}`);
        expect(response.statusCode).toBe(204);
        await setLocale('ja');
        const after = HistoryResponseSchema.parse(
          (await call('GET', '/api/history?language=ja-word')).json(),
        );
        expect(after.entries.map((entry) => entry.id)).not.toContain(single?.id);
      });
    });

    describe('changing the display language', () => {
      it('keeps everything, and shows it again in Japanese', async () => {
        await setLocale('en');
        await call('GET', '/api/history');
        await setLocale('ja');
        const ratings = RatingsResponseSchema.parse((await call('GET', '/api/ratings')).json());
        expect(ratings.languages.find((l) => l.language === 'ja-word')?.gamesPlayed).toBe(1);
        const conquests = ConquestsResponseSchema.parse(
          (await call('GET', '/api/cpu-conquests')).json(),
        );
        expect(conquests.languages.find((l) => l.language === 'ja-word')?.beatenLevels).toEqual([
          1,
        ]);
      });

      it('forfeits an unsent Japanese run: 403, the run used up, and the loss charged stays', async () => {
        await setLocale('ja');
        const before = RatingsResponseSchema.parse((await call('GET', '/api/ratings')).json());
        const games = before.languages.find((l) => l.language === 'ja-line')?.gamesPlayed ?? -1;
        const run = await issue({ language: 'ja-line', mode: 'cpu', cpuLevel: 20 });
        await setLocale('en');
        const response = await submit(run, 60);
        expect(response.statusCode).toBe(403);
        // The run is used up: a second submission is not accepted either.
        expect((await submit(run, 60)).statusCode).not.toBe(201);
        await setLocale('ja');
        const after = RatingsResponseSchema.parse((await call('GET', '/api/ratings')).json());
        expect(after.languages.find((l) => l.language === 'ja-line')?.gamesPlayed).toBe(games + 1);
      });
    });
  },
);
