import { FailureBackoff, SlidingWindowLimiter, type Clock } from '../../common/rate-limit';
import type { Env } from '../../config/env';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** Injection token for the auth limiters, created once per application. */
export const AUTH_RATE_LIMITS = Symbol('AUTH_RATE_LIMITS');

/**
 * The limits of §7 and Q31 (open sign-up protected only by rate limiting). They are in memory and
 * reset when the process restarts.
 */
export interface AuthRateLimits {
  /** 20 sign-in attempts per client address per 15 minutes. */
  readonly loginByAddress: SlidingWindowLimiter;
  /**
   * Per lower-cased username, existing or not: from the fifth consecutive failure, 1 s doubling to
   * 15 minutes; a success clears it.
   */
  readonly loginByAccount: FailureBackoff;
  /** 5 registration attempts per client address per hour. */
  readonly registerByAddress: SlidingWindowLimiter;
  /** REGISTRATION_DAILY_LIMIT accounts created in any 24 hours, across all clients. */
  readonly accountsCreated: SlidingWindowLimiter;
}

export function createAuthRateLimits(
  env: Pick<Env, 'REGISTRATION_DAILY_LIMIT'>,
  now: Clock = Date.now,
): AuthRateLimits {
  return {
    loginByAddress: new SlidingWindowLimiter({ limit: 20, windowMs: 15 * MINUTE }, now),
    loginByAccount: new FailureBackoff(
      { threshold: 5, baseDelayMs: SECOND, maxDelayMs: 15 * MINUTE, resetAfterMs: 24 * HOUR },
      now,
    ),
    registerByAddress: new SlidingWindowLimiter({ limit: 5, windowMs: HOUR }, now),
    accountsCreated: new SlidingWindowLimiter(
      { limit: env.REGISTRATION_DAILY_LIMIT, windowMs: 24 * HOUR, maxKeys: 1 },
      now,
    ),
  };
}
