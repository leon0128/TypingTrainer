import { describe, expect, it } from 'vitest';

import { parseDatabaseUrl, parseEnv } from '../src/config/env';

const DATABASE_URL = 'postgres://user:secret@127.0.0.1:5432/typing_trainer';
const PEPPER_BYTES = Buffer.alloc(32, 7);
const PASSWORD_PEPPER = PEPPER_BYTES.toString('base64');
const REQUIRED = { DATABASE_URL, PASSWORD_PEPPER };

describe('parseEnv', () => {
  it('applies defaults for a development machine and decodes the pepper', () => {
    expect(parseEnv(REQUIRED)).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL,
      PASSWORD_PEPPER: PEPPER_BYTES,
    });
  });

  it('coerces the port and rejects invalid values with the variable name', () => {
    expect(parseEnv({ ...REQUIRED, PORT: '8080' }).PORT).toBe(8080);
    expect(() => parseEnv({ ...REQUIRED, PORT: 'eighty' })).toThrow(/PORT/);
    expect(() => parseEnv({ ...REQUIRED, LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });

  it('requires a PostgreSQL DATABASE_URL', () => {
    expect(() => parseEnv({ PASSWORD_PEPPER })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ ...REQUIRED, DATABASE_URL: 'mysql://user@localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
    expect(
      parseEnv({ ...REQUIRED, DATABASE_URL: 'postgresql://user@localhost/db' }).DATABASE_URL,
    ).toBe('postgresql://user@localhost/db');
  });

  it('requires a base64 pepper of at least 32 bytes and never echoes it', () => {
    const short = Buffer.alloc(31, 7).toString('base64');
    expect(() => parseEnv({ DATABASE_URL })).toThrow(/PASSWORD_PEPPER/);
    expect(() => parseEnv({ ...REQUIRED, PASSWORD_PEPPER: 'not base64!' })).toThrow(
      /PASSWORD_PEPPER/,
    );
    expect(() => parseEnv({ ...REQUIRED, PASSWORD_PEPPER: short })).toThrow(/at least 32 bytes/);
    try {
      parseEnv({ ...REQUIRED, PASSWORD_PEPPER: short });
    } catch (error) {
      expect(String(error)).not.toContain(short);
    }
  });
});

describe('parseDatabaseUrl', () => {
  it('reads only DATABASE_URL, so migrations run without the pepper', () => {
    expect(parseDatabaseUrl({ DATABASE_URL })).toBe(DATABASE_URL);
    expect(() => parseDatabaseUrl({})).toThrow(/DATABASE_URL/);
  });
});
