import type { TypingProgram } from '@typing-trainer/contracts';
import {
  computeAccuracy,
  createEngineState,
  handleKey,
  isComplete,
  type EngineState,
} from '@typing-trainer/typing-engine';

import { referenceKpm, summarizeLatency, type ReferenceResult } from './reference-metrics';

export type PlayPhase = 'ready' | 'playing' | 'paused' | 'finished';

export interface PlaySnapshot {
  readonly engine: EngineState;
  readonly phase: PlayPhase;
  /** Increments on every MISS; the caret line uses it to restart the flash animation. */
  readonly missSeq: number;
  /** Caret-relevant engine position right after the latest MISS. */
  readonly lastMiss: { readonly atomIndex: number; readonly charIndex: number } | null;
  readonly result: ReferenceResult | null;
}

export interface PlayStore {
  getSnapshot(): PlaySnapshot;
  subscribe(listener: () => void): () => void;
  /** Feeds one engine key. `now` is a performance.now() timestamp. */
  press(key: string, now: number): void;
  pause(now: number): void;
  resume(now: number): void;
  restart(): void;
  /** Records key-to-next-frame latency in milliseconds. */
  recordLatency(ms: number): void;
  /** Stopwatch reading: from the first keystroke, excluding pauses. */
  elapsedMs(now: number): number;
}

/**
 * Holds the engine state outside React (§3.7, R2). React subscribes with useSyncExternalStore;
 * keydown handlers call `press` synchronously.
 */
export function createPlayStore(program: TypingProgram): PlayStore {
  const listeners = new Set<() => void>();
  let snapshot: PlaySnapshot;
  let startedAt = 0;
  let pausedAt = 0;
  let pausedTotal = 0;
  let finishedAt = 0;
  let latencies: number[] = [];

  const initial = (): PlaySnapshot => ({
    engine: createEngineState(program),
    phase: 'ready',
    missSeq: 0,
    lastMiss: null,
    result: null,
  });
  snapshot = initial();

  const commit = (next: PlaySnapshot) => {
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
      case 'finished':
        return finishedAt - startedAt - pausedTotal;
    }
  };

  const buildResult = (engine: EngineState): ReferenceResult => {
    const elapsed = finishedAt - startedAt - pausedTotal;
    return {
      elapsedMs: elapsed,
      referenceKpm: referenceKpm(engine.counters.effective, elapsed),
      accuracy: computeAccuracy(engine.counters),
      effective: engine.counters.effective,
      canonical: program.canonicalKeystrokes,
      miss: engine.counters.miss,
      raw: engine.counters.raw,
      latency: summarizeLatency(latencies),
    };
  };

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    press(key, now) {
      if (snapshot.phase === 'finished') return;
      if (snapshot.phase === 'ready') startedAt = now;
      if (snapshot.phase === 'paused') pausedTotal += now - pausedAt;

      const { state, verdict } = handleKey(snapshot.engine, key);
      const missed = verdict === 'MISS';
      const complete = isComplete(state);
      if (complete) finishedAt = now;

      commit({
        engine: state,
        phase: complete ? 'finished' : 'playing',
        missSeq: missed ? snapshot.missSeq + 1 : snapshot.missSeq,
        lastMiss: missed
          ? { atomIndex: state.atomIndex, charIndex: state.charIndex }
          : snapshot.lastMiss,
        result: complete ? buildResult(state) : null,
      });
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

    restart() {
      startedAt = 0;
      pausedAt = 0;
      pausedTotal = 0;
      finishedAt = 0;
      latencies = [];
      commit(initial());
    },

    recordLatency(ms) {
      latencies.push(ms);
      // The last keystroke's frame arrives after completion; refresh the summary for it.
      if (snapshot.phase === 'finished') {
        commit({ ...snapshot, result: buildResult(snapshot.engine) });
      }
    },

    elapsedMs,
  };
}
