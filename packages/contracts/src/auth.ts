import { z } from 'zod';

/**
 * Usernames (§7): 3 to 24 characters, starting with a letter or digit, then letters, digits,
 * `_`, or `-`. Uniqueness ignores case (the column is citext); the stored spelling is kept.
 * The same rule is the `chk_users_username` constraint in the database.
 */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;
export const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export const UsernameSchema = z
  .string()
  .min(USERNAME_MIN_LENGTH, `must be at least ${String(USERNAME_MIN_LENGTH)} characters`)
  .max(USERNAME_MAX_LENGTH, `must be at most ${String(USERNAME_MAX_LENGTH)} characters`)
  .regex(
    USERNAME_PATTERN,
    'may contain only letters, digits, "_" and "-", starting with a letter or digit',
  );

/**
 * Passwords (§7): 8 to 128 characters, a deliberate relaxation of NIST SP 800-63B-4's 15 for
 * single-factor authentication (Appendix B, v1.19). Length is counted in code points after NFKC normalization, which is also what gets hashed; there are no composition rules.
 * Messages never include the submitted value.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function normalizePassword(password: string): string {
  return password.normalize('NFKC');
}

// Code points, as NIST SP 800-63B-4 counts characters; grapheme clusters are deliberately not used.
const passwordLength = (password: string): number => Array.from(normalizePassword(password)).length;

export const PasswordSchema = z
  .string()
  .refine((password) => passwordLength(password) >= PASSWORD_MIN_LENGTH, {
    message: `must be at least ${String(PASSWORD_MIN_LENGTH)} characters`,
  })
  .refine((password) => passwordLength(password) <= PASSWORD_MAX_LENGTH, {
    message: `must be at most ${String(PASSWORD_MAX_LENGTH)} characters`,
  });

/**
 * An IANA time zone name, canonicalized (`asia/tokyo` becomes `Asia/Tokyo`). It fixes the day and
 * week boundaries of a user's aggregates (§6.4).
 */
export const TimezoneSchema = z.string().transform((value, context) => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    context.addIssue({ code: 'custom', message: 'must be an IANA time zone name' });
    return z.NEVER;
  }
});

/** Body of `POST /api/auth/register`. The time zone defaults to UTC when the browser sends none. */
export const RegisterRequestSchema = z
  .object({
    username: UsernameSchema,
    password: PasswordSchema,
    timezone: TimezoneSchema.default('UTC'),
  })
  .refine(
    ({ username, password }) =>
      normalizePassword(password).toLowerCase() !== username.toLowerCase(),
    { path: ['password'], message: 'must not be the username' },
  );

/**
 * Body of `POST /api/auth/login`. Only lengths are bounded, so a policy change never locks out an
 * existing account and oversized input is rejected before hashing.
 */
export const LoginRequestSchema = z.object({
  username: z.string().min(1).max(USERNAME_MAX_LENGTH),
  password: z
    .string()
    .min(1)
    .max(PASSWORD_MAX_LENGTH * 4),
});

/**
 * Body of `DELETE /api/auth/me` (§7): the password again, so that a session left open on a shared
 * machine, or a stolen one, cannot erase an account. Only its length is bounded, as for sign-in.
 */
export const DeleteAccountRequestSchema = z.object({
  password: z
    .string()
    .min(1)
    .max(PASSWORD_MAX_LENGTH * 4),
});

/**
 * Display names: what the header and the player screen show in place of the username. 1 to 24
 * characters (code points) after trimming, no control characters, not unique. The same bounds are
 * the `chk_users_display_name` constraint in the database.
 */
export const DISPLAY_NAME_MAX_LENGTH = 24;

export const DisplayNameSchema = z
  .string()
  .trim()
  .refine((value) => Array.from(value).length >= 1, { message: 'must not be empty' })
  .refine((value) => Array.from(value).length <= DISPLAY_NAME_MAX_LENGTH, {
    message: `must be at most ${String(DISPLAY_NAME_MAX_LENGTH)} characters`,
  })
  // eslint-disable-next-line no-control-regex
  .refine((value) => !/[\u0000-\u001f\u007f-\u009f]/.test(value), {
    message: 'must not contain control characters',
  });

/** Body of `PATCH /api/auth/me`. `null` or a blank string clears it, back to the username. */
export const UpdateProfileRequestSchema = z.object({
  displayName: z
    .string()
    .nullable()
    .transform((value) => (value === null || value.trim() === '' ? null : value))
    .pipe(DisplayNameSchema.nullable()),
});

export const UserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  displayName: z.string().nullable(),
  timezone: z.string(),
  locale: z.string(),
});

/** Body of a successful register, login, or `GET /api/auth/me`. */
export const AuthResponseSchema = z.object({
  user: UserSchema,
});

export type RegisterRequest = z.output<typeof RegisterRequestSchema>;
export type LoginRequest = z.output<typeof LoginRequestSchema>;
export type UpdateProfileRequest = z.output<typeof UpdateProfileRequestSchema>;
export type DeleteAccountRequest = z.output<typeof DeleteAccountRequestSchema>;
export type User = z.infer<typeof UserSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
