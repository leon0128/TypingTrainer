import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseDatabaseUrl, parseEnv } from '../src/config/env';

const DATABASE_URL = 'postgres://user:secret@127.0.0.1:5432/typing_trainer';
const PEPPER_BYTES = Buffer.alloc(32, 7);
const PASSWORD_PEPPER = PEPPER_BYTES.toString('base64');
const APP_ORIGIN = 'http://localhost:5173';
const REQUIRED = { DATABASE_URL, PASSWORD_PEPPER, APP_ORIGIN };

describe('parseEnv', () => {
  it('applies defaults for a development machine and decodes the pepper', () => {
    expect(parseEnv(REQUIRED)).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL,
      PASSWORD_PEPPER: PEPPER_BYTES,
      APP_ORIGIN,
      TRUST_PROXY: false,
      REGISTRATION_DAILY_LIMIT: 20,
      APP_VERSION: 'dev',
      CONTENT_DIR: resolve('../../content/dist'),
    });
  });

  it('coerces the port and rejects invalid values with the variable name', () => {
    expect(parseEnv({ ...REQUIRED, PORT: '8080' }).PORT).toBe(8080);
    expect(() => parseEnv({ ...REQUIRED, PORT: 'eighty' })).toThrow(/PORT/);
    expect(() => parseEnv({ ...REQUIRED, LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });

  it('requires a PostgreSQL DATABASE_URL', () => {
    expect(() => parseEnv({ PASSWORD_PEPPER, APP_ORIGIN })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ ...REQUIRED, DATABASE_URL: 'mysql://user@localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
    expect(
      parseEnv({ ...REQUIRED, DATABASE_URL: 'postgresql://user@localhost/db' }).DATABASE_URL,
    ).toBe('postgresql://user@localhost/db');
  });

  it('requires a base64 pepper of at least 32 bytes and never echoes it', () => {
    const short = Buffer.alloc(31, 7).toString('base64');
    expect(() => parseEnv({ DATABASE_URL, APP_ORIGIN })).toThrow(/PASSWORD_PEPPER/);
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

  it('requires APP_ORIGIN to be a bare origin, and https in production', () => {
    expect(() => parseEnv({ DATABASE_URL, PASSWORD_PEPPER })).toThrow(/APP_ORIGIN/);
    for (const origin of [
      'https://typing.example.com/',
      'https://typing.example.com/app',
      'ftp://x.example',
    ]) {
      expect(() => parseEnv({ ...REQUIRED, APP_ORIGIN: origin })).toThrow(/APP_ORIGIN/);
    }
    expect(
      parseEnv({ ...REQUIRED, APP_ORIGIN: 'https://typing.example.com:8443' }).APP_ORIGIN,
    ).toBe('https://typing.example.com:8443');
    expect(() => parseEnv({ ...REQUIRED, NODE_ENV: 'production' })).toThrow(/must use https/);
    expect(
      parseEnv({ ...REQUIRED, NODE_ENV: 'production', APP_ORIGIN: 'https://typing.example.com' })
        .NODE_ENV,
    ).toBe('production');
  });

  it('reads TRUST_PROXY as nothing or addresses and CIDR ranges, never true or a hop count', () => {
    expect(parseEnv(REQUIRED).TRUST_PROXY).toBe(false);
    expect(
      parseEnv({ ...REQUIRED, TRUST_PROXY: '127.0.0.1, 172.16.0.0/12, ::1' }).TRUST_PROXY,
    ).toEqual(['127.0.0.1', '172.16.0.0/12', '::1']);
    for (const value of ['true', '1', '10.0.0.0/33', 'localhost', '10.0.0.1/8/9']) {
      expect(() => parseEnv({ ...REQUIRED, TRUST_PROXY: value })).toThrow(/TRUST_PROXY/);
    }
  });
});

describe('CONTENT_DIR', () => {
  it('resolves against the working directory', () => {
    expect(parseEnv({ ...REQUIRED, CONTENT_DIR: 'bundles' }).CONTENT_DIR).toBe(resolve('bundles'));
    expect(parseEnv({ ...REQUIRED, CONTENT_DIR: '/srv/content' }).CONTENT_DIR).toBe('/srv/content');
  });
});

describe('parseDatabaseUrl', () => {
  it('reads only DATABASE_URL, so migrations run without the pepper', () => {
    expect(parseDatabaseUrl({ DATABASE_URL })).toBe(DATABASE_URL);
    expect(() => parseDatabaseUrl({})).toThrow(/DATABASE_URL/);
  });
});
