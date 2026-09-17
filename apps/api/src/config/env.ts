import { z } from 'zod';

/** At least 256 bits, as for any HMAC-strength secret. */
export const PASSWORD_PEPPER_MIN_BYTES = 32;

const DatabaseUrlSchema = z.url({ protocol: /^postgres(ql)?$/ });

/** Environment variables read by the API. Invalid values stop the process at startup. */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** postgres://user:password@host:port/database */
  DATABASE_URL: DatabaseUrlSchema,
  /**
   * Base64 secret mixed into every password hash as Argon2's `secret` (§7). It is never stored in
   * the database, so it must be backed up separately: losing it invalidates every password.
   * Messages never include the value.
   */
  PASSWORD_PEPPER: z
    .base64('must be base64')
    .transform((value) => Buffer.from(value, 'base64'))
    .refine((pepper) => pepper.length >= PASSWORD_PEPPER_MIN_BYTES, {
      message: `must decode to at least ${String(PASSWORD_PEPPER_MIN_BYTES)} bytes`,
    }),
});

export type Env = z.infer<typeof EnvSchema>;

/** Injection token for the parsed environment. */
export const ENV = Symbol('ENV');

function parse<T extends z.ZodType>(
  schema: T,
  source: Readonly<Record<string, string | undefined>>,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(`invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export function parseEnv(source: Readonly<Record<string, string | undefined>>): Env {
  return parse(EnvSchema, source);
}

/** The TypeORM CLI only needs the database, so running migrations never requires the pepper. */
export function parseDatabaseUrl(source: Readonly<Record<string, string | undefined>>): string {
  return parse(z.object({ DATABASE_URL: DatabaseUrlSchema }), source).DATABASE_URL;
}
