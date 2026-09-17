import { describe, expect, it } from 'vitest';

import { sessionCookieName, sessionCookieOptions } from '../src/modules/auth/session-cookie';

describe('session cookie', () => {
  it('uses the __Host- prefix with Secure in production', () => {
    const env = { NODE_ENV: 'production' } as const;
    expect(sessionCookieName(env)).toBe('__Host-tt_session');
    expect(sessionCookieOptions(env)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
  });

  it.each(['development', 'test'] as const)(
    'uses a plain name without Secure in %s, for http://localhost',
    (NODE_ENV) => {
      expect(sessionCookieName({ NODE_ENV })).toBe('tt_session');
      expect(sessionCookieOptions({ NODE_ENV })).toMatchObject({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
      });
    },
  );
});
