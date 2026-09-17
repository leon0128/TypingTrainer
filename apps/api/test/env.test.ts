import { describe, expect, it } from 'vitest';

import { parseEnv } from '../src/config/env';

const DATABASE_URL = 'postgres://user:secret@127.0.0.1:5432/typing_trainer';

describe('parseEnv', () => {
  it('applies defaults for a development machine', () => {
    expect(parseEnv({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL,
    });
  });

  it('coerces the port and rejects invalid values with the variable name', () => {
    expect(parseEnv({ DATABASE_URL, PORT: '8080' }).PORT).toBe(8080);
    expect(() => parseEnv({ DATABASE_URL, PORT: 'eighty' })).toThrow(/PORT/);
    expect(() => parseEnv({ DATABASE_URL, LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });

  it('requires a PostgreSQL DATABASE_URL', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: 'mysql://user@localhost/db' })).toThrow(/DATABASE_URL/);
    expect(parseEnv({ DATABASE_URL: 'postgresql://user@localhost/db' }).DATABASE_URL).toBe(
      'postgresql://user@localhost/db',
    );
  });
});
