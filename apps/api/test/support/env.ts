import { parseEnv, type Env } from '../../src/config/env';

/** A fixed test-only pepper (32 bytes). */
export const TEST_PASSWORD_PEPPER = Buffer.alloc(32, 0x5a).toString('base64');

/** A connection string that is never dialed, for tests that build the application graph only. */
export const UNUSED_DATABASE_URL = 'postgres://unused@127.0.0.1:1/unused';

/** The origin tests send state-changing requests from. */
export const TEST_APP_ORIGIN = 'http://localhost:5173';

/** The environment of an application under test: silent, with a test pepper and origin. */
export function testEnv(overrides: Readonly<Record<string, string>> = {}): Env {
  return parseEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: UNUSED_DATABASE_URL,
    PASSWORD_PEPPER: TEST_PASSWORD_PEPPER,
    APP_ORIGIN: TEST_APP_ORIGIN,
    ...overrides,
  });
}
