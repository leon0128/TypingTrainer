import type { TypingProgram } from '@typing-trainer/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createPlayStore } from '../src/features/play/play-store';

const AB: TypingProgram = {
  blockId: 'ab',
  atoms: [{ kind: 'literal', text: 'ab' }],
  canonicalKeystrokes: 2,
};

describe('createPlayStore', () => {
  it('starts the stopwatch on the first keystroke, even a miss', () => {
    const store = createPlayStore(AB);
    expect(store.getSnapshot().phase).toBe('ready');
    expect(store.elapsedMs(500)).toBe(0);

    store.press('x', 1_000);
    expect(store.getSnapshot().phase).toBe('playing');
    expect(store.elapsedMs(1_250)).toBe(250);
  });

  it('excludes paused time and finishes on completion with a reference result', () => {
    const store = createPlayStore(AB);
    store.press('a', 1_000);
    store.pause(2_000);
    expect(store.getSnapshot().phase).toBe('paused');
    expect(store.elapsedMs(4_000)).toBe(1_000);
    store.resume(5_000);
    store.press('b', 7_000);

    const { phase, result } = store.getSnapshot();
    expect(phase).toBe('finished');
    expect(result).toMatchObject({
      elapsedMs: 3_000,
      referenceKpm: 40,
      accuracy: 1,
      effective: 2,
      canonical: 2,
      miss: 0,
      raw: 2,
    });
    expect(store.elapsedMs(99_000)).toBe(3_000);
  });

  it('counts misses for the flash and remembers where the latest one happened', () => {
    const store = createPlayStore(AB);
    store.press('a', 0);
    store.press('x', 1);
    store.press('x', 2);
    expect(store.getSnapshot()).toMatchObject({
      missSeq: 2,
      lastMiss: { atomIndex: 0, charIndex: 1 },
    });
  });

  it('ignores keys after completion and notifies subscribers of changes', () => {
    const store = createPlayStore(AB);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.press('a', 0);
    store.press('b', 1);
    const finished = store.getSnapshot();
    store.press('c', 2);
    expect(store.getSnapshot()).toBe(finished);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.restart();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot()).toMatchObject({ phase: 'ready', missSeq: 0, result: null });
  });

  it('includes latency recorded after the final keystroke in the result', () => {
    const store = createPlayStore(AB);
    store.press('a', 0);
    store.recordLatency(4);
    store.press('b', 10);
    store.recordLatency(12);
    expect(store.getSnapshot().result?.latency).toEqual({ samples: 2, maxMs: 12, p95Ms: 12 });
  });
});
