import { z } from 'zod';

import { TRACKS, type Track } from './tracks';

/** The display languages (§8.4). */
export const LOCALES = ['en', 'ja'] as const;
export const LocaleSchema = z.enum(LOCALES);

/** Fonts for the play screen (§8.2, §13.10): all open source, self-hosted, all monospaced. */
export const FONTS = [
  'jetbrains-mono',
  'fira-code',
  'source-code-pro',
  'ibm-plex-mono',
  'noto-sans-mono',
  'm-plus-1-code',
  'biz-ud-gothic',
] as const;
export const FontSchema = z.enum(FONTS);

/** Code sizes in pixels (§8.2). */
export const FONT_SIZES = [14, 16, 18, 20, 24] as const;
export const FontSizeSchema = z.union(FONT_SIZES.map((size) => z.literal(size)));

/** `system` follows the operating system's light or dark setting (§8.2, v1.26). */
export const THEMES = ['system', 'light', 'dark', 'high-contrast'] as const;
export const ThemeSchema = z.enum(THEMES);

/** Looks of the whole app, apart from the light or dark theme; `classic` is the plain original. */
export const SKINS = ['classic', 'neon', 'pixel', 'fantasy', 'pop'] as const;
export const SkinSchema = z.enum(SKINS);

/** Color sets for typed, pending, cursor, and error text (§8.2). */
export const COLOR_PRESETS = ['standard', 'okabe-ito', 'monochrome'] as const;
export const ColorPresetSchema = z.enum(COLOR_PRESETS);

/**
 * The fonts a track offers (§13.10): the five Latin ones for code and English, and two that also
 * draw Japanese for the Japanese track, whose romaji line is Latin in the same font.
 */
export const TRACK_FONTS: Record<Track, readonly Font[]> = {
  code: FONTS.slice(0, 5),
  'natural-en': FONTS.slice(0, 5),
  'natural-ja': FONTS.slice(5),
};

/** The play screen's look, kept for each track (§13.10). */
export const PlayAppearanceSchema = z.object({
  font: FontSchema,
  fontSize: FontSizeSchema,
  colorPreset: ColorPresetSchema,
});

/** What an account has until it chooses otherwise. */
export const DEFAULT_APPEARANCE = {
  theme: 'system',
  skin: 'classic',
} as const;

export const DEFAULT_PLAY_APPEARANCE: Record<Track, PlayAppearance> = {
  code: { font: 'jetbrains-mono', fontSize: 18, colorPreset: 'standard' },
  'natural-en': { font: 'jetbrains-mono', fontSize: 18, colorPreset: 'standard' },
  'natural-ja': { font: 'm-plus-1-code', fontSize: 18, colorPreset: 'standard' },
};

/** Key sound packs (§8.3): three, plus off. */
export const SOUND_PACKS = ['off', 'mechanical', 'soft', 'beep'] as const;
export const SoundPackSchema = z.enum(SOUND_PACKS);

/** Key sound volume, 0 to 100 (§8.3). */
export const SoundVolumeSchema = z.int().min(0).max(100);

/** Off, and low when turned on: nothing is heard until the player asks for it (§8.3). */
export const DEFAULT_SOUND = {
  soundPack: 'off',
  soundVolume: 30,
} as const;

export const SoundSchema = z.object({
  soundPack: SoundPackSchema,
  soundVolume: SoundVolumeSchema,
});

export const AppearanceSchema = z.object({
  theme: ThemeSchema,
  skin: SkinSchema,
});

/**
 * The play look of every track the account may use. The Japanese track is left out for an account
 * whose display language is not Japanese, so nothing Japanese reaches it (§13.11).
 */
export const PlayAppearancesSchema = z.object({
  code: PlayAppearanceSchema,
  'natural-en': PlayAppearanceSchema,
  'natural-ja': PlayAppearanceSchema.optional(),
});

/**
 * What `GET /api/preferences` returns (§9.5). The time zone is shown but not editable: it is fixed
 * when the account is created (§6.4).
 */
export const PreferencesSchema = AppearanceSchema.extend(SoundSchema.shape).extend({
  timezone: z.string(),
  locale: LocaleSchema,
  play: PlayAppearancesSchema,
});

/** A change to one track's play look; a font the track does not offer is refused. */
export const PlayChangeSchema = z
  .object({
    track: z.enum(TRACKS),
    font: FontSchema.optional(),
    fontSize: FontSizeSchema.optional(),
    colorPreset: ColorPresetSchema.optional(),
  })
  .strict()
  .refine(
    (change) => change.font === undefined || TRACK_FONTS[change.track].includes(change.font),
    {
      message: 'this track does not offer that font',
      path: ['font'],
    },
  )
  .refine(
    (change) =>
      change.font !== undefined ||
      change.fontSize !== undefined ||
      change.colorPreset !== undefined,
    { message: 'send at least one setting' },
  );

/**
 * Body of `PUT /api/preferences`: only the fields sent are changed, and at least one is required.
 * Unknown fields are refused rather than ignored, so a client that tries to send the time zone
 * learns that it was not applied.
 */
export const UpdatePreferencesRequestSchema = z
  .object({
    locale: LocaleSchema.optional(),
    theme: ThemeSchema.optional(),
    skin: SkinSchema.optional(),
    soundPack: SoundPackSchema.optional(),
    soundVolume: SoundVolumeSchema.optional(),
    play: PlayChangeSchema.optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((setting) => setting !== undefined), {
    message: 'send at least one setting',
  });

export type Locale = z.infer<typeof LocaleSchema>;
export type Font = z.infer<typeof FontSchema>;
export type FontSize = z.infer<typeof FontSizeSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type Skin = z.infer<typeof SkinSchema>;
export type PlayAppearance = z.infer<typeof PlayAppearanceSchema>;
export type PlayAppearances = z.infer<typeof PlayAppearancesSchema>;
export type PlayChange = z.infer<typeof PlayChangeSchema>;
export type ColorPreset = z.infer<typeof ColorPresetSchema>;
export type Appearance = z.infer<typeof AppearanceSchema>;
export type SoundPack = z.infer<typeof SoundPackSchema>;
export type Sound = z.infer<typeof SoundSchema>;
export type Preferences = z.infer<typeof PreferencesSchema>;
export type UpdatePreferencesRequest = z.output<typeof UpdatePreferencesRequestSchema>;
