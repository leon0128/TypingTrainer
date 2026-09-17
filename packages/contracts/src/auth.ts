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
 * Passwords (§7): NIST SP 800-63B-4 for single-factor authentication. Length is counted in code
 * points after NFKC normalization, which is also what gets hashed; there are no composition rules.
 * Messages never include the submitted value.
 */
export const PASSWORD_MIN_LENGTH = 15;
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

export const UserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  timezone: z.string(),
  locale: z.string(),
});

/** Body of a successful register, login, or `GET /api/auth/me`. */
export const AuthResponseSchema = z.object({
  user: UserSchema,
});

export type RegisterRequest = z.output<typeof RegisterRequestSchema>;
export type LoginRequest = z.output<typeof LoginRequestSchema>;
export type User = z.infer<typeof UserSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
