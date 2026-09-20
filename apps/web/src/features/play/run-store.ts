import type { SessionLog, StartSessionResponse } from '@typing-trainer/contracts';
import {
  IDLE_LIMIT_MS,
  PLAY_DURATION_MS,
  buildSessionLog,
  computeMetrics,
  createSession,
  endSessionByTime,
  sessionCounters,
  sessionIdleMs,
  sessionKey,
  type LoggedKey,
  type OfficialMetrics,
  type SessionState,
} from '@typing-trainer/typing-engine';

import { createCpuOpponent, type CpuOpponent } from './cpu-opponent';

/** `ready` until the first keystroke starts the countdown (§4.1). */
export type RunPhase = 'ready' | 'playing' | 'paused' | 'ended';

/**
 * How the run ended. `time` and `blocks` are results to submit; `idle` is not — a run left idle
 * past the limit is discarded and never saved (§4.1), and the server would refuse it anyway.
 */
export type RunEnd = 'time' | 'blocks' | 'idle';

export interface RunSnapshot {
  readonly session: SessionState;
  readonly phase: RunPhase;
  /** Increments on every MISS; the caret line uses it to restart the flash animation. */
  readonly missSeq: number;
  /** Caret-relevant engine position right after the latest MISS. */
  readonly lastMiss: { readonly atomIndex: number; readonly charIndex: number } | null;
  readonly endedBy: RunEnd | null;
}

export interface RunStore {
  readonly issued: StartSessionResponse;
  /** The CPU of a vs CPU run, advanced by this store's own run clock; null for single play. */
  readonly opponent: CpuOpponent | null;
  // Function properties rather than methods: both are passed unbound to useSyncExternalStore.
  readonly getSnapshot: () => RunSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  /** Feeds one engine key. `now` is a `performance.now()` timestamp. */
  press(key: string, now: number): void;
  pause(now: number): void;
  resume(now: number): void;
  /** Advances the clock without a keystroke, ending the run when time or the idle limit runs out. */
  tick(now: number): void;
  /** Run time so far, in milliseconds, pauses excluded. */
  elapsedMs(now: number): number;
  /** Countdown reading, never below zero. */
  remainingMs(now: number): number;
  /** Idle time so far (§4.1): wall-clock time since the run was issued minus the run time. */
  idleMs(now: number): number;
  /** The log to submit (§9.8). Only keys the engine applied are in it. */
  buildLog(): SessionLog;
  /**
   * The metrics of the run so far. The run length is fixed, so these are the official formulas
   * (§3.6), not an estimate — the server recomputes the same numbers from the log.
   */
  liveMetrics(): OfficialMetrics;
}

/**
 * A key's time on the store's clock. In a browser an event timestamp and `performance.now()`
 * share the time origin (HR-Time), and the event's own reading is the more accurate one — it is
 * when the key was pressed, not when the handler ran. Some environments (jsdom, for one) report
 * epoch milliseconds instead, and mixing the two clocks would make a run look idle for decades,
 * so a reading that is nowhere near the store's clock is replaced by it.
 */
export function onRunClock(timeStamp: number): number {
  const now = performance.now();
  return Math.abs(now - timeStamp) > 1000 ? now : timeStamp;
}

/**
 * Why an issued run cannot be played, or null when it can. The run length and idle limit are
 * enforced on both sides (§9.8), so a server that uses different ones means the client is out of
 * date and must not play a run neither side agrees on.
 */
export function issuedRunProblem(issued: StartSessionResponse): string | null {
  if (issued.durationMs !== PLAY_DURATION_MS || issued.idleLimitMs !== IDLE_LIMIT_MS) {
    return 'this version of the app plays a different run length than the server; reload the page';
  }
  return issued.blocks.length === 0 ? 'the server issued a run with no blocks' : null;
}

/**
 * Holds the run outside React (§3.7): React subscribes with `useSyncExternalStore`, while keydown
 * handlers call `press` synchronously.
 *
 * `issuedAt` is the `performance.now()` reading when the run arrived; idle time is measured from
 * it, so the wait before the first keystroke counts just as the server counts it.
 */
export function createRunStore(issued: StartSessionResponse, issuedAt: number): RunStore {
  const problem = issuedRunProblem(issued);
  if (problem !== null) throw new RangeError(problem);

  const opponent =
    issued.mode === 'cpu' && issued.cpuLevel !== null
      ? createCpuOpponent(issued, issued.cpuLevel)
      : null;
  const listeners = new Set<() => void>();
  const logged: LoggedKey[] = [];
  let startedAt = 0;
  let pausedAt = 0;
  let pausedTotal = 0;
  /** The stopwatch reading when the run ended, so the display does not move afterwards. */
  let frozenMs = 0;

  let snapshot: RunSnapshot = {
    session: createSession(issued.blocks),
    phase: 'ready',
    missSeq: 0,
    lastMiss: null,
    endedBy: null,
  };

  const commit = (next: RunSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const elapsedMs = (now: number): number => {
    switch (snapshot.phase) {
      case 'ready':
        return 0;
      case 'playing':
        return now - startedAt - pausedTotal;
      case 'paused':
        return pausedAt - startedAt - pausedTotal;
      case 'ended':
        return frozenMs;
    }
  };

  const idleMs = (now: number): number => sessionIdleMs(now - issuedAt, elapsedMs(now));

  /** Ends the run, keeping the phase, the reason, and the frozen stopwatch in one place. */
  const end = (session: SessionState, endedBy: RunEnd, elapsedAtEnd: number) => {
    frozenMs = elapsedAtEnd;
    commit({ ...snapshot, session, phase: 'ended', endedBy });
    opponent?.advanceTo(frozenMs);
  };

  return {
    issued,
    opponent,
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    press(key, now) {
      if (snapshot.phase === 'ended') return;
      if (snapshot.phase === 'ready') startedAt = now;
      if (snapshot.phase === 'paused') pausedTotal += now - pausedAt;

      const { session } = snapshot;
      // Never let a clock reading go backwards past the engine's last key, which it rejects.
      const ms = Math.max(session.activeMs, Math.round(now - startedAt - pausedTotal));
      const { state, verdict } = sessionKey(session, key, ms);

      if (verdict === 'EXPIRED') {
        // The key landed after the run ended; it is not part of the log the server replays.
        end(state, state.endedBy ?? 'time', Math.min(ms, PLAY_DURATION_MS));
        return;
      }
      logged.push({ key, activeMs: ms });
      if (state.endedBy !== null) frozenMs = ms;

      const missed = verdict === 'MISS';
      commit({
        session: state,
        phase: state.endedBy === null ? 'playing' : 'ended',
        missSeq: missed ? snapshot.missSeq + 1 : snapshot.missSeq,
        lastMiss:
          missed && state.block !== null
            ? { atomIndex: state.block.atomIndex, charIndex: state.block.charIndex }
            : snapshot.lastMiss,
        endedBy: state.endedBy,
      });
      // The CPU runs on the player's run clock, so it starts with the first key and stops when the
      // player pauses.
      opponent?.advanceTo(elapsedMs(now));
    },

    pause(now) {
      if (snapshot.phase !== 'playing') return;
      pausedAt = now;
      commit({ ...snapshot, phase: 'paused' });
    },

    resume(now) {
      if (snapshot.phase !== 'paused') return;
      pausedTotal += now - pausedAt;
      commit({ ...snapshot, phase: 'playing' });
    },

    tick(now) {
      if (snapshot.phase === 'ended') return;
      if (idleMs(now) > IDLE_LIMIT_MS) {
        // Left as it stands: the run is discarded, so its run time stays what was actually typed.
        end(snapshot.session, 'idle', elapsedMs(now));
        return;
      }
      if (snapshot.phase === 'playing' && elapsedMs(now) >= PLAY_DURATION_MS) {
        end(endSessionByTime(snapshot.session), 'time', PLAY_DURATION_MS);
        return;
      }
      if (snapshot.phase === 'playing') opponent?.advanceTo(elapsedMs(now));
    },

    elapsedMs,
    idleMs,

    remainingMs(now) {
      return Math.max(0, PLAY_DURATION_MS - elapsedMs(now));
    },

    buildLog: () => buildSessionLog(logged),

    liveMetrics: () => computeMetrics(sessionCounters(snapshot.session)),
  };
}
