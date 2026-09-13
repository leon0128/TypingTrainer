import type { SessionLog, TypingProgram } from '@typing-trainer/contracts';

import {
  ENTER_KEY,
  TAB_KEY,
  createEngineState,
  handleKey,
  isComplete,
  type EngineState,
  type KeystrokeCounters,
  type Verdict,
} from './engine';
import { PLAY_DURATION_MS, computeMetrics, type OfficialMetrics } from './metrics';

/**
 * A run that has been idle longer than this is discarded (§4.1). Idle time is the wall-clock time
 * since the session was issued minus the run time consumed, so it covers the wait before the first
 * key and every pause, however they are split.
 */
export const IDLE_LIMIT_MS = 900_000;

export type SessionEnd = 'time' | 'blocks';

export interface SessionState {
  /** The issued blocks, in order (§5.3). */
  readonly programs: readonly TypingProgram[];
  /** Index of the current block; `programs.length` once every block is done. */
  readonly blockIndex: number;
  /** Engine state of the current block, or null once every block is done. */
  readonly block: EngineState | null;
  /** Counters of the completed blocks. */
  readonly totals: KeystrokeCounters;
  /** Run time of the latest key, in whole milliseconds (pauses excluded). */
  readonly activeMs: number;
  readonly endedBy: SessionEnd | null;
}

/** EXPIRED: the key arrived after the run ended (time up or all blocks done) and was ignored. */
export type SessionVerdict = Verdict | 'EXPIRED';

export interface SessionKeyResult {
  readonly state: SessionState;
  readonly verdict: SessionVerdict;
}

const ZERO: KeystrokeCounters = { raw: 0, effective: 0, miss: 0, ignored: 0 };

const addCounters = (a: KeystrokeCounters, b: KeystrokeCounters): KeystrokeCounters => ({
  raw: a.raw + b.raw,
  effective: a.effective + b.effective,
  miss: a.miss + b.miss,
  ignored: a.ignored + b.ignored,
});

export function createSession(programs: readonly TypingProgram[]): SessionState {
  const first = programs[0];
  if (first === undefined) throw new RangeError('A session needs at least one block');
  return {
    programs,
    blockIndex: 0,
    block: createEngineState(first),
    totals: ZERO,
    activeMs: 0,
    endedBy: null,
  };
}

/**
 * Applies one engine key at `activeMs` of run time. Times are rounded to whole milliseconds, the
 * resolution of the submitted log, so a live session and a replay of its log always agree. A key
 * at or after PLAY_DURATION_MS ends the run instead of being applied (§4.1).
 */
export function sessionKey(state: SessionState, key: string, activeMs: number): SessionKeyResult {
  const ms = Math.round(activeMs);
  if (ms < state.activeMs) {
    throw new RangeError(
      `Run time went backwards: ${String(ms)} ms after ${String(state.activeMs)} ms`,
    );
  }
  if (state.endedBy !== null || state.block === null) return { state, verdict: 'EXPIRED' };
  if (ms >= PLAY_DURATION_MS) {
    return { state: { ...state, activeMs: ms, endedBy: 'time' }, verdict: 'EXPIRED' };
  }

  const { state: block, verdict } = handleKey(state.block, key);
  if (!isComplete(block)) return { state: { ...state, block, activeMs: ms }, verdict };

  const totals = addCounters(state.totals, block.counters);
  const blockIndex = state.blockIndex + 1;
  const next = state.programs[blockIndex];
  return {
    state: {
      programs: state.programs,
      blockIndex,
      block: next === undefined ? null : createEngineState(next),
      totals,
      activeMs: ms,
      endedBy: next === undefined ? 'blocks' : null,
    },
    verdict,
  };
}

/** Ends the run when the countdown reaches zero without a key (§4.1). */
export function endSessionByTime(state: SessionState): SessionState {
  return state.endedBy === null ? { ...state, activeMs: PLAY_DURATION_MS, endedBy: 'time' } : state;
}

/** Counters of the whole run: completed blocks plus the partial progress of the current one (Q5). */
export function sessionCounters(state: SessionState): KeystrokeCounters {
  return state.block === null ? state.totals : addCounters(state.totals, state.block.counters);
}

/** Sum of `canonicalKeystrokes` over every block the run has reached, the ceiling for `effective`. */
export function canonicalReached(state: SessionState): number {
  const reached = Math.min(state.blockIndex + 1, state.programs.length);
  return state.programs
    .slice(0, reached)
    .reduce((sum, program) => sum + program.canonicalKeystrokes, 0);
}

/** Idle time of a session (see IDLE_LIMIT_MS). */
export function sessionIdleMs(wallElapsedMs: number, activeMs: number): number {
  return Math.max(0, wallElapsedMs - activeMs);
}

export function isSessionIdleExpired(wallElapsedMs: number, activeMs: number): boolean {
  return sessionIdleMs(wallElapsedMs, activeMs) > IDLE_LIMIT_MS;
}

export interface LoggedKey {
  readonly key: string;
  /** Run time of the key in milliseconds (pauses excluded); may be fractional. */
  readonly activeMs: number;
}

const toLogKey = (key: string): string => (key === ENTER_KEY ? '\n' : key === TAB_KEY ? '\t' : key);
const fromLogKey = (key: string): string =>
  key === '\n' ? ENTER_KEY : key === '\t' ? TAB_KEY : key;

/** Builds the submitted log (§9.8) from keys in order, rounding times like `sessionKey`. */
export function buildSessionLog(keys: readonly LoggedKey[]): SessionLog {
  let previous = 0;
  const deltas: number[] = [];
  for (const { activeMs } of keys) {
    const ms = Math.round(activeMs);
    if (ms < previous) throw new RangeError('Logged keys must be in run-time order');
    deltas.push(ms - previous);
    previous = ms;
  }
  return { version: 1, keys: keys.map(({ key }) => toLogKey(key)).join(''), deltas };
}

export interface IntervalStats {
  /** Shortest gap between consecutive applied keys, or null with fewer than two keys. */
  readonly minMs: number | null;
  /** Median gap between consecutive applied keys, or null with fewer than two keys. */
  readonly medianMs: number | null;
  /** Most applied keys within any 10-second window, as keys per minute. */
  readonly peakKpm10s: number;
}

export interface SessionReplay {
  readonly state: SessionState;
  /** Counters of the whole run, including the partial last block. */
  readonly counters: KeystrokeCounters;
  readonly blocksReached: number;
  readonly canonicalReached: number;
  /** How the run ended; `log-end` when the log stops before time runs out or blocks are done. */
  readonly endedBy: SessionEnd | 'log-end';
  /** Run time of the last applied key, or 0 when none was applied. */
  readonly lastKeyMs: number;
  /** Keys that arrived after the run ended and were ignored. */
  readonly expiredKeys: number;
  readonly intervals: IntervalStats;
  readonly metrics: OfficialMetrics;
}

const WINDOW_MS = 10_000;

/**
 * Replays a submitted log against the issued blocks (§9.8). It applies the same `sessionKey` a live
 * client uses, so the recomputed counters match the client's exactly.
 */
export function replaySession(programs: readonly TypingProgram[], log: SessionLog): SessionReplay {
  const keys = Array.from(log.keys);
  if (keys.length !== log.deltas.length) {
    throw new RangeError(`${String(log.deltas.length)} deltas for ${String(keys.length)} keys`);
  }

  let state = createSession(programs);
  let time = 0;
  let expiredKeys = 0;
  const applied: number[] = [];
  keys.forEach((key, index) => {
    time += log.deltas[index] ?? 0;
    const result = sessionKey(state, fromLogKey(key), time);
    state = result.state;
    if (result.verdict === 'EXPIRED') expiredKeys += 1;
    else applied.push(time);
  });

  const counters = sessionCounters(state);
  return {
    state,
    counters,
    blocksReached: Math.min(state.blockIndex + 1, programs.length),
    canonicalReached: canonicalReached(state),
    endedBy: state.endedBy ?? 'log-end',
    lastKeyMs: applied.at(-1) ?? 0,
    expiredKeys,
    intervals: intervalStats(applied),
    metrics: computeMetrics(counters),
  };
}

function intervalStats(times: readonly number[]): IntervalStats {
  const gaps: number[] = [];
  for (let index = 1; index < times.length; index += 1) {
    gaps.push((times[index] ?? 0) - (times[index - 1] ?? 0));
  }
  const sorted = [...gaps].sort((a, b) => a - b);

  let peak = 0;
  let windowStart = 0;
  times.forEach((time, index) => {
    while ((times[windowStart] ?? 0) <= time - WINDOW_MS) windowStart += 1;
    peak = Math.max(peak, index - windowStart + 1);
  });

  return {
    minMs: sorted[0] ?? null,
    medianMs: sorted.length === 0 ? null : (sorted[Math.floor((sorted.length - 1) / 2)] ?? null),
    peakKpm10s: peak * (60_000 / WINDOW_MS),
  };
}
