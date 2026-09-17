/**
 * In-memory rate limiting (§7). The API runs as a single process (§9.7), so counters live in memory
 * and reset when the process restarts; that is an accepted limitation. Every store keeps at most
 * `maxKeys` keys and evicts the least recently updated one, so unbounded keys such as submitted
 * usernames cannot exhaust memory.
 */

/** Milliseconds since the epoch; injected so tests control time. */
export type Clock = () => number;

export const DEFAULT_MAX_KEYS = 10_000;

export interface LimitDecision {
  readonly allowed: boolean;
  /** 0 when allowed; otherwise how long until the key may try again. */
  readonly retryAfterMs: number;
}

const ALLOWED: LimitDecision = { allowed: true, retryAfterMs: 0 };

/** Whole seconds for a Retry-After header, never 0 for a refused request. */
export function retryAfterSeconds(decision: LimitDecision): number {
  return Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
}

class BoundedStore<V> {
  private readonly entries = new Map<string, V>();

  constructor(private readonly maxKeys: number) {
    if (!Number.isInteger(maxKeys) || maxKeys < 1) throw new RangeError('maxKeys must be positive');
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: string): V | undefined {
    return this.entries.get(key);
  }

  /** Stores the value as the most recently updated key, evicting the oldest beyond the bound. */
  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > this.maxKeys) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }
}

/** Allows at most `limit` attempts per key within any `windowMs`; refused attempts do not count. */
export class SlidingWindowLimiter {
  private readonly attempts: BoundedStore<number[]>;

  constructor(
    private readonly options: {
      readonly limit: number;
      readonly windowMs: number;
      readonly maxKeys?: number;
    },
    private readonly now: Clock = Date.now,
  ) {
    this.attempts = new BoundedStore(options.maxKeys ?? DEFAULT_MAX_KEYS);
  }

  get trackedKeys(): number {
    return this.attempts.size;
  }

  /** Records an attempt for the key if it is within the limit. */
  hit(key: string): LimitDecision {
    const time = this.now();
    const recent = (this.attempts.get(key) ?? []).filter(
      (attempt) => attempt > time - this.options.windowMs,
    );
    const oldest = recent[0];
    if (recent.length >= this.options.limit && oldest !== undefined) {
      this.attempts.set(key, recent);
      return { allowed: false, retryAfterMs: oldest + this.options.windowMs - time };
    }
    recent.push(time);
    this.attempts.set(key, recent);
    return ALLOWED;
  }
}

interface FailureState {
  readonly failures: number;
  readonly lastFailureAt: number;
  readonly blockedUntil: number;
}

/**
 * Exponential backoff after consecutive failures: once `threshold` failures have accumulated, each
 * further failure blocks the key for `baseDelayMs × 2^(failures − threshold)`, capped at
 * `maxDelayMs`. A success clears the key, and failures older than `resetAfterMs` are forgotten.
 */
export class FailureBackoff {
  private readonly states: BoundedStore<FailureState>;

  constructor(
    private readonly options: {
      readonly threshold: number;
      readonly baseDelayMs: number;
      readonly maxDelayMs: number;
      readonly resetAfterMs: number;
      readonly maxKeys?: number;
    },
    private readonly now: Clock = Date.now,
  ) {
    this.states = new BoundedStore(options.maxKeys ?? DEFAULT_MAX_KEYS);
  }

  get trackedKeys(): number {
    return this.states.size;
  }

  /** Whether the key may attempt now, without recording anything. */
  check(key: string): LimitDecision {
    const state = this.current(key);
    const time = this.now();
    return state !== undefined && state.blockedUntil > time
      ? { allowed: false, retryAfterMs: state.blockedUntil - time }
      : ALLOWED;
  }

  recordFailure(key: string): void {
    const time = this.now();
    const failures = (this.current(key)?.failures ?? 0) + 1;
    const exponent = failures - this.options.threshold;
    const blockedUntil =
      exponent < 0
        ? 0
        : time + Math.min(this.options.baseDelayMs * 2 ** exponent, this.options.maxDelayMs);
    this.states.set(key, { failures, lastFailureAt: time, blockedUntil });
  }

  recordSuccess(key: string): void {
    this.states.delete(key);
  }

  private current(key: string): FailureState | undefined {
    const state = this.states.get(key);
    if (state !== undefined && this.now() - state.lastFailureAt > this.options.resetAfterMs) {
      this.states.delete(key);
      return undefined;
    }
    return state;
  }
}
