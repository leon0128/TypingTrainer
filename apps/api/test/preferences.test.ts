import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  ApiErrorSchema,
  AuthResponseSchema,
  COLOR_PRESETS,
  FONT_SIZES,
  TRACKS,
  TRACK_FONTS,
  SKINS,
  PreferencesSchema,
  SOUND_PACKS,
  THEMES,
} from '@typing-trainer/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { TEST_APP_ORIGIN, testEnv } from './support/env';
import { TEST_DATABASE_URL, createTestDatabase, type TestDatabase } from './support/test-database';

const PASSWORD = 'correct horse battery staple';
const COOKIE = 'tt_session';

const APPEARANCE_DEFAULTS = { theme: 'system', skin: 'classic' };

const LATIN_PLAY = { font: 'jetbrains-mono', fontSize: 18, colorPreset: 'standard' };
const JAPANESE_PLAY = { font: 'm-plus-1-code', fontSize: 18, colorPreset: 'standard' };

/** What an account whose display language is not Japanese has: no Japanese track at all (§13.11). */
const ENGLISH_PLAY = { code: LATIN_PLAY, 'natural-en': LATIN_PLAY };

/** Silent until chosen, and low when it is (§8.3). */
const SOUND_DEFAULTS = { soundPack: 'off', soundVolume: 30 };

let counter = 0;
const nextUsername = () => `chooser${String((counter += 1))}`;
let addressCounter = 0;
const nextAddress = () => `198.19.0.${String((addressCounter += 1))}`;

describe.runIf(TEST_DATABASE_URL !== undefined)('/api/preferences (TEST_DATABASE_URL)', () => {
  let database: TestDatabase;
  let app: NestFastifyApplication;

  async function signedIn(timezone: string): Promise<{ id: string; token: string }> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      remoteAddress: nextAddress(),
      headers: { origin: TEST_APP_ORIGIN },
      payload: { username: nextUsername(), password: PASSWORD, timezone },
    });
    expect(response.statusCode).toBe(201);
    return {
      id: AuthResponseSchema.parse(response.json()).user.id,
      token: response.cookies.find((cookie) => cookie.name === COOKIE)?.value ?? '',
    };
  }

  const call = (token: string, method: 'GET' | 'PUT', payload?: unknown) =>
    app.inject({
      method,
      url: '/api/preferences',
      headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${token}` },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });

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

  it('starts in English with the time zone the account was created with', async () => {
    const me = await signedIn('Asia/Tokyo');
    const response = await call(me.token, 'GET');
    expect(response.statusCode).toBe(200);
    expect(PreferencesSchema.parse(response.json())).toEqual({
      timezone: 'Asia/Tokyo',
      locale: 'en',
      ...APPEARANCE_DEFAULTS,
      ...SOUND_DEFAULTS,
      play: ENGLISH_PLAY,
    });
  });

  it('changes the display language, and every later read sees it', async () => {
    const me = await signedIn('America/New_York');
    const put = await call(me.token, 'PUT', { locale: 'ja' });
    expect(put.statusCode).toBe(200);
    expect(PreferencesSchema.parse(put.json())).toEqual({
      timezone: 'America/New_York',
      locale: 'ja',
      ...APPEARANCE_DEFAULTS,
      ...SOUND_DEFAULTS,
      play: { ...ENGLISH_PLAY, 'natural-ja': JAPANESE_PLAY },
    });

    expect(PreferencesSchema.parse((await call(me.token, 'GET')).json()).locale).toBe('ja');
    const account = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { origin: TEST_APP_ORIGIN, cookie: `${COOKIE}=${me.token}` },
    });
    expect(AuthResponseSchema.parse(account.json()).user.locale).toBe('ja');

    await call(me.token, 'PUT', { locale: 'en' });
    expect(PreferencesSchema.parse((await call(me.token, 'GET')).json()).locale).toBe('en');
  });

  it("leaves other players' settings alone", async () => {
    const me = await signedIn('UTC');
    const other = await signedIn('UTC');
    await call(me.token, 'PUT', { locale: 'ja' });
    expect(PreferencesSchema.parse((await call(other.token, 'GET')).json()).locale).toBe('en');
  });

  it.each([
    ['an unknown language', { locale: 'fr' }],
    ['a language of the wrong type', { locale: 1 }],
    ['nothing at all', {}],
    ['a time zone, which is not editable', { timezone: 'Asia/Tokyo' }],
    ['a language together with a time zone', { locale: 'ja', timezone: 'Asia/Tokyo' }],
    ['an unknown setting', { locale: 'ja', sound: 'beep' }],
    ['an unknown font', { play: { track: 'code', font: 'comic-sans' } }],
    ['a size that is not offered', { play: { track: 'code', fontSize: 17 } }],
    ['a size sent as text', { play: { track: 'code', fontSize: '18' } }],
    ['a font sent for no track', { font: 'fira-code' }],
    ['a play change for no track', { play: { font: 'fira-code' } }],
    ['a play change of nothing', { play: { track: 'code' } }],
    ['an unknown track', { play: { track: 'natural-fr', fontSize: 16 } }],
    ['a Japanese font for the code track', { play: { track: 'code', font: 'm-plus-1-code' } }],
    [
      'a Japanese font for the English track',
      { play: { track: 'natural-en', font: 'biz-ud-gothic' } },
    ],
    ['a Latin font for the Japanese track', { play: { track: 'natural-ja', font: 'fira-code' } }],
    ['an unknown theme', { theme: 'sepia' }],
    ['an unknown color preset', { play: { track: 'code', colorPreset: 'neon' } }],
    ['an unknown skin', { skin: 'sepia' }],
    ['an unknown sound pack', { soundPack: 'thunder' }],
    ['a volume above 100', { soundVolume: 101 }],
    ['a negative volume', { soundVolume: -1 }],
    ['a fractional volume', { soundVolume: 30.5 }],
    ['a volume sent as text', { soundVolume: '30' }],
  ])('refuses %s', async (_name, payload) => {
    const me = await signedIn('Europe/Paris');
    const response = await call(me.token, 'PUT', payload);
    expect(response.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(response.json()).statusCode).toBe(400);
    // Nothing was applied, and in particular the time zone is as it was.
    expect(PreferencesSchema.parse((await call(me.token, 'GET')).json())).toEqual({
      timezone: 'Europe/Paris',
      locale: 'en',
      ...APPEARANCE_DEFAULTS,
      ...SOUND_DEFAULTS,
      play: ENGLISH_PLAY,
    });
  });

  describe('sound', () => {
    const sound = async (token: string) => {
      const { soundPack, soundVolume } = PreferencesSchema.parse((await call(token, 'GET')).json());
      return { soundPack, soundVolume };
    };

    it('is off and low until chosen', async () => {
      const me = await signedIn('UTC');
      expect(await sound(me.token)).toEqual({ soundPack: 'off', soundVolume: 30 });
    });

    it('stores the pack and the volume, each on its own and both at once', async () => {
      const me = await signedIn('UTC');
      await call(me.token, 'PUT', { soundPack: 'soft' });
      expect(await sound(me.token)).toEqual({ soundPack: 'soft', soundVolume: 30 });
      await call(me.token, 'PUT', { soundVolume: 75 });
      expect(await sound(me.token)).toEqual({ soundPack: 'soft', soundVolume: 75 });
      await call(me.token, 'PUT', { soundPack: 'beep', soundVolume: 0 });
      expect(await sound(me.token)).toEqual({ soundPack: 'beep', soundVolume: 0 });
    });

    it('accepts every pack and the ends of the volume range', async () => {
      const me = await signedIn('UTC');
      for (const body of [
        ...SOUND_PACKS.map((soundPack) => ({ soundPack })),
        { soundVolume: 0 },
        { soundVolume: 100 },
      ]) {
        expect((await call(me.token, 'PUT', body)).statusCode, JSON.stringify(body)).toBe(200);
      }
    });

    it('leaves the appearance alone, and the sound alone when the appearance changes', async () => {
      const me = await signedIn('UTC');
      await call(me.token, 'PUT', { soundPack: 'mechanical', soundVolume: 60 });
      await call(me.token, 'PUT', { theme: 'dark', play: { track: 'code', fontSize: 24 } });
      expect(await sound(me.token)).toEqual({ soundPack: 'mechanical', soundVolume: 60 });
      const saved = PreferencesSchema.parse((await call(me.token, 'GET')).json());
      expect(saved).toMatchObject({ theme: 'dark' });
      expect(saved.play.code.fontSize).toBe(24);
    });

    it("keeps one player's sound from another's", async () => {
      const me = await signedIn('UTC');
      const other = await signedIn('UTC');
      await call(me.token, 'PUT', { soundPack: 'mechanical', soundVolume: 90 });
      expect(await sound(other.token)).toEqual({ soundPack: 'off', soundVolume: 30 });
    });

    it.each([
      ['sound_pack', 'thunder'],
      ['sound_volume', 101],
      ['sound_volume', -1],
    ])('refuses %s = %s in the database, whatever wrote it', async (column, value) => {
      const me = await signedIn('UTC');
      await call(me.token, 'PUT', { soundPack: 'soft' });
      await expect(
        database.dataSource.query(`UPDATE user_preferences SET ${column} = $2 WHERE user_id = $1`, [
          me.id,
          value,
        ]),
      ).rejects.toThrow(/chk_user_preferences_/);
    });
  });

  describe('appearance', () => {
    const appearance = async (token: string) => {
      const { theme, skin } = PreferencesSchema.parse((await call(token, 'GET')).json());
      return { theme, skin };
    };

    it('stores each setting and keeps the ones not sent', async () => {
      const me = await signedIn('UTC');
      const first = await call(me.token, 'PUT', { theme: 'high-contrast' });
      expect(first.statusCode).toBe(200);
      expect(PreferencesSchema.parse(first.json())).toMatchObject({
        theme: 'high-contrast',
        skin: 'classic',
      });
      await call(me.token, 'PUT', { skin: 'pixel' });
      expect(await appearance(me.token)).toEqual({ theme: 'high-contrast', skin: 'pixel' });
    });

    it('accepts every offered value', async () => {
      const me = await signedIn('UTC');
      for (const body of [
        ...THEMES.map((theme) => ({ theme })),
        ...SKINS.map((skin) => ({ skin })),
      ]) {
        expect((await call(me.token, 'PUT', body)).statusCode, JSON.stringify(body)).toBe(200);
      }
    });

    it('changes the language and the appearance together, or neither', async () => {
      const me = await signedIn('UTC');
      const both = await call(me.token, 'PUT', { locale: 'ja', theme: 'dark' });
      expect(PreferencesSchema.parse(both.json())).toMatchObject({ locale: 'ja', theme: 'dark' });
    });

    it("keeps one player's appearance from another's", async () => {
      const me = await signedIn('UTC');
      const other = await signedIn('UTC');
      await call(me.token, 'PUT', { theme: 'light', skin: 'neon' });
      expect(await appearance(other.token)).toEqual({ theme: 'system', skin: 'classic' });
    });

    it('creates a row only when something is changed', async () => {
      const me = await signedIn('UTC');
      const count = () =>
        database.dataSource
          .query<{ n: string }[]>('SELECT count(*) AS n FROM user_preferences WHERE user_id = $1', [
            me.id,
          ])
          .then((rows) => Number(rows[0]?.n));
      await call(me.token, 'GET');
      await call(me.token, 'PUT', { locale: 'ja' });
      expect(await count()).toBe(0);
      await call(me.token, 'PUT', { theme: 'dark' });
      expect(await count()).toBe(1);
    });

    it('is deleted with the account', async () => {
      const me = await signedIn('UTC');
      await call(me.token, 'PUT', { theme: 'dark' });
      await database.dataSource.query('DELETE FROM users WHERE id = $1', [me.id]);
      const rows = await database.dataSource.query<unknown[]>(
        'SELECT 1 FROM user_preferences WHERE user_id = $1',
        [me.id],
      );
      expect(rows).toHaveLength(0);
    });

    it.each([
      ['theme', 'sepia'],
      ['skin', 'sepia'],
    ])('refuses %s = %s in the database, whatever wrote it', async (column, value) => {
      const me = await signedIn('UTC');
      await call(me.token, 'PUT', { theme: 'dark' });
      await expect(
        database.dataSource.query(`UPDATE user_preferences SET ${column} = $2 WHERE user_id = $1`, [
          me.id,
          value,
        ]),
      ).rejects.toThrow(/chk_user_preferences_/);
    });
  });

  describe('the play screen look of each track (§13.10)', () => {
    const play = async (token: string) =>
      PreferencesSchema.parse((await call(token, 'GET')).json()).play;
    const japanese = async () => {
      const me = await signedIn('Asia/Tokyo');
      await call(me.token, 'PUT', { locale: 'ja' });
      return me;
    };

    it('starts every track from its own defaults, and the Japanese font is a Japanese one', async () => {
      const me = await japanese();
      expect(await play(me.token)).toEqual({
        ...ENGLISH_PLAY,
        'natural-ja': JAPANESE_PLAY,
      });
    });

    it('changes one track and keeps the others, and the settings not sent', async () => {
      const me = await japanese();
      await call(me.token, 'PUT', { play: { track: 'natural-en', font: 'fira-code' } });
      await call(me.token, 'PUT', { play: { track: 'natural-en', fontSize: 24 } });
      await call(me.token, 'PUT', {
        play: { track: 'natural-ja', font: 'biz-ud-gothic', colorPreset: 'monochrome' },
      });
      expect(await play(me.token)).toEqual({
        code: LATIN_PLAY,
        'natural-en': { font: 'fira-code', fontSize: 24, colorPreset: 'standard' },
        'natural-ja': { font: 'biz-ud-gothic', fontSize: 18, colorPreset: 'monochrome' },
      });
    });

    it('accepts every font a track offers, every size and every colour set', async () => {
      const me = await japanese();
      for (const track of TRACKS) {
        const bodies = [
          ...TRACK_FONTS[track].map((font) => ({ font })),
          ...FONT_SIZES.map((fontSize) => ({ fontSize })),
          ...COLOR_PRESETS.map((colorPreset) => ({ colorPreset })),
        ];
        for (const body of bodies) {
          const response = await call(me.token, 'PUT', { play: { track, ...body } });
          expect(response.statusCode, JSON.stringify({ track, ...body })).toBe(200);
        }
      }
    });

    it("keeps one player's look from another's", async () => {
      const me = await signedIn('UTC');
      const other = await signedIn('UTC');
      await call(me.token, 'PUT', { play: { track: 'code', font: 'ibm-plex-mono', fontSize: 14 } });
      expect(await play(other.token)).toEqual(ENGLISH_PLAY);
    });

    it('is deleted with the account', async () => {
      const me = await signedIn('UTC');
      await call(me.token, 'PUT', { play: { track: 'code', fontSize: 20 } });
      await database.dataSource.query('DELETE FROM users WHERE id = $1', [me.id]);
      const rows = await database.dataSource.query<unknown[]>(
        'SELECT 1 FROM user_play_appearance WHERE user_id = $1',
        [me.id],
      );
      expect(rows).toHaveLength(0);
    });

    describe('for an account whose display language is not Japanese (§13.11)', () => {
      it('has no Japanese track in what it reads, and refuses to change it with 403', async () => {
        const me = await signedIn('UTC');
        const response = await call(me.token, 'PUT', {
          play: { track: 'natural-ja', font: 'biz-ud-gothic' },
        });
        expect(response.statusCode).toBe(403);
        expect(await play(me.token)).toEqual(ENGLISH_PLAY);
        expect(JSON.stringify((await call(me.token, 'GET')).json())).not.toContain('natural-ja');
        const rows = await database.dataSource.query<unknown[]>(
          'SELECT 1 FROM user_play_appearance WHERE user_id = $1',
          [me.id],
        );
        expect(rows).toHaveLength(0);
      });

      it('has the Japanese look it saved hidden again after leaving Japanese, and back after returning', async () => {
        const me = await japanese();
        await call(me.token, 'PUT', { play: { track: 'natural-ja', fontSize: 24 } });
        await call(me.token, 'PUT', { locale: 'en' });
        expect(await play(me.token)).toEqual(ENGLISH_PLAY);
        await call(me.token, 'PUT', { locale: 'ja' });
        expect((await play(me.token))['natural-ja']?.fontSize).toBe(24);
      });

      it('is refused a change together with a language change, and nothing is applied', async () => {
        const me = await signedIn('UTC');
        const response = await call(me.token, 'PUT', {
          locale: 'ja',
          play: { track: 'natural-ja', fontSize: 24 },
        });
        expect(response.statusCode).toBe(403);
        expect(PreferencesSchema.parse((await call(me.token, 'GET')).json()).locale).toBe('en');
      });
    });

    it.each([
      ['a font of the other script for a track', 'natural-ja', 'jetbrains-mono', 18, 'standard'],
      ['a Japanese font for the code track', 'code', 'm-plus-1-code', 18, 'standard'],
      ['a size that is not offered', 'code', 'jetbrains-mono', 17, 'standard'],
      ['a colour set that is not offered', 'code', 'jetbrains-mono', 18, 'neon'],
      ['an unknown track', 'natural-fr', 'jetbrains-mono', 18, 'standard'],
    ])(
      'refuses %s in the database, whatever wrote it',
      async (_name, track, font, size, preset) => {
        const me = await signedIn('UTC');
        await expect(
          database.dataSource.query(
            `INSERT INTO user_play_appearance (user_id, track, font, font_size, color_preset)
           VALUES ($1, $2, $3, $4, $5)`,
            [me.id, track, font, size, preset],
          ),
        ).rejects.toThrow(/chk_user_play_appearance_/);
      },
    );
  });

  it('requires a session', async () => {
    for (const method of ['GET', 'PUT'] as const) {
      const response = await app.inject({
        method,
        url: '/api/preferences',
        headers: { origin: TEST_APP_ORIGIN },
        ...(method === 'PUT' ? { payload: { locale: 'ja' } } : {}),
      });
      expect(response.statusCode).toBe(401);
    }
  });

  it('refuses a language the database does not know, whatever wrote it', async () => {
    const me = await signedIn('UTC');
    await expect(
      database.dataSource.query(`UPDATE users SET locale = 'fr' WHERE id = $1`, [me.id]),
    ).rejects.toThrow(/chk_users_locale/);
  });
});
