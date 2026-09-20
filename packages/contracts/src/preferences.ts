import { z } from 'zod';

/** The display languages (§8.4). */
export const LOCALES = ['en', 'ja'] as const;
export const LocaleSchema = z.enum(LOCALES);

/**
 * What `GET /api/preferences` returns (§9.5). The time zone is shown but not editable: it is fixed
 * when the account is created (§6.4).
 */
export const PreferencesSchema = z.object({
  timezone: z.string(),
  locale: LocaleSchema,
});

/**
 * Body of `PUT /api/preferences`: only the fields sent are changed, and at least one is required.
 * Unknown fields are refused rather than ignored, so a client that tries to send the time zone
 * learns that it was not applied.
 */
export const UpdatePreferencesRequestSchema = z
  .object({ locale: LocaleSchema.optional() })
  .strict()
  .refine((value) => value.locale !== undefined, { message: 'send at least one setting' });

export type Locale = z.infer<typeof LocaleSchema>;
export type Preferences = z.infer<typeof PreferencesSchema>;
export type UpdatePreferencesRequest = z.output<typeof UpdatePreferencesRequestSchema>;
