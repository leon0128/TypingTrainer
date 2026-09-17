import { describe, expect, it } from 'vitest';

import {
  FailureBackoff,
  SlidingWindowLimiter,
  retryAfterSeconds,
  type LimitDecision,
} from '../src/common/rate-limit';

function fakeClock(start = 1_000_000) {
  let time = start;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;

describe('SlidingWindowLimiter', () => {
  it('allows the limit within the window, then refuses until the oldest attempt expires', () => {
    const clock = fakeClock();
    const limiter = new SlidingWindowLimiter({ limit: 3, windowMs: MINUTE }, clock.now);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(limiter.hit('ip-a').allowed).toBe(true);
      clock.advance(10 * SECOND);
    }
    // Attempts at 0 s, 10 s, 20 s; now 30 s: the oldest expires at 60 s.
    expect(limiter.hit('ip-a')).toEqual({ allowed: false, retryAfterMs: 30 * SECOND });
    clock.advance(30 * SECOND - 1);
    expect(limiter.hit('ip-a').allowed).toBe(false);
    clock.advance(1);
    expect(limiter.hit('ip-a').allowed).toBe(true);
  });

  it('does not count refused attempts, so hammering does not extend the wait', () => {
    const clock = fakeClock();
    const limiter = new SlidingWindowLimiter({ limit: 1, windowMs: MINUTE }, clock.now);
    expect(limiter.hit('ip-a').allowed).toBe(true);
    for (let attempt = 0; attempt < 100; attempt += 1) limiter.hit('ip-a');
    clock.advance(MINUTE);
    expect(limiter.hit('ip-a').allowed).toBe(true);
  });

  it('counts keys independently', () => {
    const limiter = new SlidingWindowLimiter({ limit: 1, windowMs: MINUTE }, fakeClock().now);
    expect(limiter.hit('ip-a').allowed).toBe(true);
    expect(limiter.hit('ip-b').allowed).toBe(true);
    expect(limiter.hit('ip-a').allowed).toBe(false);
  });

  it('keeps at most maxKeys keys, evicting the least recently updated', () => {
    const limiter = new SlidingWindowLimiter(
      { limit: 1, windowMs: MINUTE, maxKeys: 2 },
      fakeClock().now,
    );
    limiter.hit('ip-a');
    limiter.hit('ip-b');
    limiter.hit('ip-a'); // refused, but updates ip-a
    limiter.hit('ip-c'); // evicts ip-b
    expect(limiter.trackedKeys).toBe(2);
    expect(limiter.hit('ip-b').allowed).toBe(true);
    expect(limiter.hit('ip-c').allowed).toBe(false);
  });
});

describe('FailureBackoff', () => {
  const options = {
    threshold: 5,
    baseDelayMs: SECOND,
    maxDelayMs: 15 * MINUTE,
    resetAfterMs: 24 * 60 * MINUTE,
  };

  const blockedFor = (decision: LimitDecision) => (decision.allowed ? 0 : decision.retryAfterMs);

  it('blocks for 1 s after the fifth consecutive failure, doubling each time up to 15 min', () => {
    const clock = fakeClock();
    const backoff = new FailureBackoff(options, clock.now);
    for (let failure = 1; failure <= 4; failure += 1) {
      backoff.recordFailure('alice');
      expect(backoff.check('alice').allowed).toBe(true);
    }
    const delays: number[] = [];
    for (let failure = 5; failure <= 16; failure += 1) {
      backoff.recordFailure('alice');
      const delay = blockedFor(backoff.check('alice'));
      delays.push(delay);
      clock.advance(delay);
      expect(backoff.check('alice').allowed).toBe(true);
    }
    expect(delays).toEqual(
      [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 900, 900].map((seconds) => seconds * SECOND),
    );
  });

  it('clears the key on success', () => {
    const backoff = new FailureBackoff(options, fakeClock().now);
    for (let failure = 0; failure < 6; failure += 1) backoff.recordFailure('alice');
    expect(backoff.check('alice').allowed).toBe(false);
    backoff.recordSuccess('alice');
    expect(backoff.check('alice').allowed).toBe(true);
    backoff.recordFailure('alice');
    expect(backoff.check('alice').allowed).toBe(true);
  });

  it('forgets failures older than resetAfterMs', () => {
    const clock = fakeClock();
    const backoff = new FailureBackoff(options, clock.now);
    for (let failure = 0; failure < 4; failure += 1) backoff.recordFailure('alice');
    clock.advance(options.resetAfterMs + 1);
    backoff.recordFailure('alice');
    expect(backoff.check('alice').allowed).toBe(true);
  });

  it('keeps at most maxKeys keys', () => {
    const backoff = new FailureBackoff({ ...options, maxKeys: 3 }, fakeClock().now);
    for (let index = 0; index < 50; index += 1) backoff.recordFailure(`user-${String(index)}`);
    expect(backoff.trackedKeys).toBe(3);
  });
});

describe('retryAfterSeconds', () => {
  it('rounds up and never answers 0 for a refusal', () => {
    expect(retryAfterSeconds({ allowed: false, retryAfterMs: 1 })).toBe(1);
    expect(retryAfterSeconds({ allowed: false, retryAfterMs: 1001 })).toBe(2);
    expect(retryAfterSeconds({ allowed: false, retryAfterMs: 0 })).toBe(1);
  });
});
