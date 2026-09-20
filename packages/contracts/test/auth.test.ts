import { describe, expect, it } from 'vitest';

import {
  LoginRequestSchema,
  PasswordSchema,
  RegisterRequestSchema,
  TimezoneSchema,
  UsernameSchema,
} from '../src';

const PASSWORD = 'correct horse battery';

describe('UsernameSchema', () => {
  it.each(['abc', 'Alice', 'a_b-c', '9lives', 'a'.repeat(24)])('accepts %s', (username) => {
    expect(UsernameSchema.safeParse(username).success).toBe(true);
  });

  it.each(['ab', 'a'.repeat(25), '_alice', '-alice', 'a b', 'alice!', 'ユーザー名です'])(
    'rejects %s',
    (username) => {
      expect(UsernameSchema.safeParse(username).success).toBe(false);
    },
  );
});

describe('PasswordSchema', () => {
  it('requires 8 to 128 characters', () => {
    expect(PasswordSchema.safeParse('a'.repeat(7)).success).toBe(false);
    expect(PasswordSchema.safeParse('a'.repeat(8)).success).toBe(true);
    expect(PasswordSchema.safeParse('a'.repeat(128)).success).toBe(true);
    expect(PasswordSchema.safeParse('a'.repeat(129)).success).toBe(false);
  });

  it('counts code points after NFKC normalization', () => {
    // U+FB01 (the "fi" ligature) normalizes to "fi": 4 ligatures are 8 characters.
    expect(PasswordSchema.safeParse('\uFB01'.repeat(3)).success).toBe(false);
    expect(PasswordSchema.safeParse('\uFB01'.repeat(4)).success).toBe(true);
    // An astral character is one code point, not two UTF-16 units.
    expect(PasswordSchema.safeParse('😀'.repeat(7)).success).toBe(false);
    expect(PasswordSchema.safeParse('😀'.repeat(8)).success).toBe(true);
  });

  it('has no composition rules', () => {
    expect(PasswordSchema.safeParse('aaaaaaaaaaaaaaa').success).toBe(true);
  });

  it('never echoes the password in its messages', () => {
    const secret = 'sh-secr';
    const result = PasswordSchema.safeParse(secret);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).not.toContain(secret);
  });
});

describe('TimezoneSchema', () => {
  it('canonicalizes IANA names and rejects anything else', () => {
    expect(TimezoneSchema.parse('asia/tokyo')).toBe('Asia/Tokyo');
    expect(TimezoneSchema.parse('UTC')).toBe('UTC');
    expect(TimezoneSchema.safeParse('Mars/Olympus_Mons').success).toBe(false);
  });
});

describe('RegisterRequestSchema', () => {
  it('defaults the time zone to UTC', () => {
    expect(RegisterRequestSchema.parse({ username: 'alice', password: PASSWORD })).toEqual({
      username: 'alice',
      password: PASSWORD,
      timezone: 'UTC',
    });
  });

  it('rejects a password equal to the username, ignoring case', () => {
    const result = RegisterRequestSchema.safeParse({
      username: 'Correct_horse_battery',
      password: 'correct_HORSE_battery',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['password']);
  });
});

describe('LoginRequestSchema', () => {
  it('bounds lengths only, so an account created under an older policy can still sign in', () => {
    expect(LoginRequestSchema.safeParse({ username: 'al', password: 'short' }).success).toBe(true);
    expect(LoginRequestSchema.safeParse({ username: '', password: 'x' }).success).toBe(false);
    expect(
      LoginRequestSchema.safeParse({ username: 'alice', password: 'x'.repeat(513) }).success,
    ).toBe(false);
  });
});
