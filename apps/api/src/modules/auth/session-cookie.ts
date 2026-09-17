import type { CookieSerializeOptions } from '@fastify/cookie';

import type { Env } from '../../config/env';
import { SESSION_COOKIE_MAX_AGE_SECONDS } from './auth.constants';

/**
 * The session cookie (§7). In production the `__Host-` prefix makes browsers accept it only with
 * Secure, Path=/, and no Domain, so a subdomain cannot set or shadow it. Development serves the web
 * app over http://localhost, where a Secure cookie with that prefix is not usable, so it uses a
 * plain name without Secure.
 */
export function sessionCookieName(env: Pick<Env, 'NODE_ENV'>): string {
  return env.NODE_ENV === 'production' ? '__Host-tt_session' : 'tt_session';
}

/** Path and flags shared by setting and clearing, so a clear always matches the cookie it removes. */
function sessionCookieAttributes(env: Pick<Env, 'NODE_ENV'>): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

/** Attributes for setting the cookie. */
export function sessionCookieOptions(env: Pick<Env, 'NODE_ENV'>): CookieSerializeOptions {
  return { ...sessionCookieAttributes(env), maxAge: SESSION_COOKIE_MAX_AGE_SECONDS };
}

/** Attributes for clearing the cookie: the same path and flags, without Max-Age. */
export function sessionCookieClearOptions(env: Pick<Env, 'NODE_ENV'>): CookieSerializeOptions {
  return sessionCookieAttributes(env);
}
