import { z } from 'zod';

/** The display languages (§8.4). */
export const LOCALES = ['en', 'ja'] as const;
export const LocaleSchema = z.enum(LOCALES);

/** Code fonts (§8.2): all open source, self-hosted. */
export const FONTS = [
  'jetbrains-mono',
  'fira-code',
  'source-code-pro',
  'ibm-plex-mono',
  'noto-sans-mono',
] as const;
export const FontSchema = z.enum(FONTS);

/** Code sizes in pixels (§8.2). */
export const FONT_SIZES = [14, 16, 18, 20, 24] as const;
export const FontSizeSchema = z.union(FONT_SIZES.map((size) => z.literal(size)));

/** `system` follows the operating system's light or dark setting (§8.2, v1.26). */
export const THEMES = ['system', 'light', 'dark', 'high-contrast'] as const;
export const ThemeSchema = z.enum(THEMES);

/** Color sets for typed, pending, cursor, and error text (§8.2). */
export const COLOR_PRESETS = ['standard', 'okabe-ito', 'monochrome'] as const;
export const ColorPresetSchema = z.enum(COLOR_PRESETS);

/** What an account has until it chooses otherwise. */
export const DEFAULT_APPEARANCE = {
  font: 'jetbrains-mono',
  fontSize: 18,
  theme: 'system',
  colorPreset: 'standard',
} as const;

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
  font: FontSchema,
  fontSize: FontSizeSchema,
  theme: ThemeSchema,
  colorPreset: ColorPresetSchema,
});

/**
 * What `GET /api/preferences` returns (§9.5). The time zone is shown but not editable: it is fixed
 * when the account is created (§6.4).
 */
export const PreferencesSchema = AppearanceSchema.extend(SoundSchema.shape).extend({
  timezone: z.string(),
  locale: LocaleSchema,
});

/**
 * Body of `PUT /api/preferences`: only the fields sent are changed, and at least one is required.
 * Unknown fields are refused rather than ignored, so a client that tries to send the time zone
 * learns that it was not applied.
 */
export const UpdatePreferencesRequestSchema = z
  .object({
    locale: LocaleSchema.optional(),
    font: FontSchema.optional(),
    fontSize: FontSizeSchema.optional(),
    theme: ThemeSchema.optional(),
    colorPreset: ColorPresetSchema.optional(),
    soundPack: SoundPackSchema.optional(),
    soundVolume: SoundVolumeSchema.optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((setting) => setting !== undefined), {
    message: 'send at least one setting',
  });

export type Locale = z.infer<typeof LocaleSchema>;
export type Font = z.infer<typeof FontSchema>;
export type FontSize = z.infer<typeof FontSizeSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type ColorPreset = z.infer<typeof ColorPresetSchema>;
export type Appearance = z.infer<typeof AppearanceSchema>;
export type SoundPack = z.infer<typeof SoundPackSchema>;
export type Sound = z.infer<typeof SoundSchema>;
export type Preferences = z.infer<typeof PreferencesSchema>;
export type UpdatePreferencesRequest = z.output<typeof UpdatePreferencesRequestSchema>;
