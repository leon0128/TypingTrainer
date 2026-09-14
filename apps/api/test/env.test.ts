import { describe, expect, it } from 'vitest';

import { parseEnv } from '../src/config/env';

describe('parseEnv', () => {
  it('applies defaults for a development machine', () => {
    expect(parseEnv({})).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      LOG_LEVEL: 'info',
    });
  });

  it('coerces the port and rejects invalid values with the variable name', () => {
    expect(parseEnv({ PORT: '8080' }).PORT).toBe(8080);
    expect(() => parseEnv({ PORT: 'eighty' })).toThrow(/PORT/);
    expect(() => parseEnv({ LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });
});
