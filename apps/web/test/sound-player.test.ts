import { describe, expect, it } from 'vitest';

import {
  MAX_VOICES,
  SoundPlayer,
  loudness,
  type AudioBufferLike,
  type AudioContextLike,
  type BufferSourceLike,
  type GainNodeLike,
} from '../src/features/sound/player';

class FakeGain implements GainNodeLike {
  readonly gain = {
    value: 1,
    ramps: [] as { value: number; time: number }[],
    cancelScheduledValues: () => undefined,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime(value: number, time: number) {
      this.ramps.push({ value, time });
    },
  };
  connectedTo: unknown = null;
  disconnected = false;
  connect(destination: unknown) {
    this.connectedTo = destination;
  }
  disconnect() {
    this.disconnected = true;
  }
}

class FakeSource implements BufferSourceLike {
  buffer: AudioBufferLike | null = null;
  onended: (() => void) | null = null;
  started: number | null = null;
  stoppedAt: number | null = null;
  connectedTo: unknown = null;
  connect(destination: unknown) {
    this.connectedTo = destination;
  }
  disconnect() {
    this.disconnected = true;
  }
  disconnected = false;
  start(when = 0) {
    this.started = when;
  }
  stop(when = 0) {
    this.stoppedAt = when;
  }
  /** What the browser does when a note finishes. */
  finish() {
    this.onended?.();
  }
}

class FakeContext implements AudioContextLike {
  sampleRate = 48000;
  state = 'suspended';
  currentTime = 0;
  destination = { name: 'speakers' };
  resumed = 0;
  closed = false;
  buffersMade = 0;
  readonly gains: FakeGain[] = [];
  readonly sources: FakeSource[] = [];
  resume() {
    this.resumed += 1;
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
  createBuffer(_channels: number, length: number): AudioBufferLike {
    this.buffersMade += 1;
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
}

/** The one context a test's player made. */
function only(contexts: FakeContext[]): FakeContext {
  const [context] = contexts;
  if (context === undefined || contexts.length !== 1) {
    throw new Error(`expected exactly one context, got ${String(contexts.length)}`);
  }
  return context;
}

function setup() {
  const contexts: FakeContext[] = [];
  const player = new SoundPlayer(() => {
    const context = new FakeContext();
    contexts.push(context);
    return context;
  });
  return { player, contexts };
}

describe('the sound player', () => {
  it('makes no audio context, and no sound, while the pack is off', () => {
    const { player, contexts } = setup();
    player.configure({ pack: 'off', volume: 80 });
    player.play('hit');
    player.unlock();
    expect(contexts).toHaveLength(0);
  });

  it('makes none at a volume of zero either', () => {
    const { player, contexts } = setup();
    player.configure({ pack: 'beep', volume: 0 });
    player.play('hit');
    player.play('miss');
    player.unlock();
    expect(contexts).toHaveLength(0);
  });

  it('starts the context from the first sound, once, and plays through it', () => {
    const { player, contexts } = setup();
    player.configure({ pack: 'mechanical', volume: 50 });
    player.play('hit');
    player.play('hit');
    player.play('miss');
    expect(contexts).toHaveLength(1);
    const context = only(contexts);
    // A context the browser created suspended is resumed by the first gesture, and only then.
    expect(context.resumed).toBe(1);
    expect(context.sources).toHaveLength(3);
    expect(context.sources.every((source) => source.started === 0)).toBe(true);
  });

  it('can be unlocked by a gesture without making a sound', () => {
    const { player, contexts } = setup();
    player.configure({ pack: 'soft', volume: 50 });
    player.unlock();
    const context = only(contexts);
    expect(context.resumed).toBe(1);
    expect(context.sources).toHaveLength(0);
    player.play('hit');
    expect(contexts).toHaveLength(1);
    expect(context.resumed).toBe(1);
  });

  it('builds each sound once, however often it is played, and a hit and a miss differ', () => {
    const { player, contexts } = setup();
    player.configure({ pack: 'beep', volume: 50 });
    for (let count = 0; count < 5; count += 1) {
      player.play('hit');
      player.play('miss');
    }
    const context = only(contexts);
    expect(context.buffersMade).toBe(2);
    const hit = context.sources[0]?.buffer;
    const miss = context.sources[1]?.buffer;
    expect(hit).not.toBe(miss);
    expect(context.sources[2]?.buffer).toBe(hit);
    expect(context.sources[3]?.buffer).toBe(miss);
  });

  it('switches to the new pack’s sounds when the pack changes', () => {
    const { player, contexts } = setup();
    player.configure({ pack: 'beep', volume: 50 });
    player.play('hit');
    player.configure({ pack: 'soft', volume: 50 });
    player.play('hit');
    const context = only(contexts);
    expect(context.buffersMade).toBe(2);
    expect(context.sources[0]?.buffer).not.toBe(context.sources[1]?.buffer);
    // Back again: the beep buffer is reused, not rebuilt.
    player.configure({ pack: 'beep', volume: 50 });
    player.play('hit');
    expect(context.buffersMade).toBe(2);
    expect(context.sources[2]?.buffer).toBe(context.sources[0]?.buffer);
  });

  it('sets the master volume on a curve, and follows a change at once', () => {
    const { player, contexts } = setup();
    player.configure({ pack: 'beep', volume: 50 });
    player.play('hit');
    const context = only(contexts);
    const master = context.gains[0];
    if (master === undefined) throw new Error('no master gain');
    expect(master.connectedTo).toBe(context.destination);
    expect(master.gain.value).toBeCloseTo(0.25, 10);
    player.configure({ pack: 'beep', volume: 100 });
    expect(master.gain.value).toBe(1);
    player.configure({ pack: 'beep', volume: 20 });
    expect(master.gain.value).toBeCloseTo(0.04, 10);
    expect(loudness(-5)).toBe(0);
    expect(loudness(250)).toBe(1);
  });

  it('routes every note through the master gain', () => {
    const { player, contexts } = setup();
    player.configure({ pack: 'beep', volume: 50 });
    player.play('hit');
    const context = only(contexts);
    const [master, voiceGain] = context.gains;
    if (master === undefined || voiceGain === undefined) throw new Error('missing gains');
    expect(context.sources[0]?.connectedTo).toBe(voiceGain);
    expect(voiceGain.connectedTo).toBe(master);
  });

  describe('the voice pool (§8.3)', () => {
    it(`never sounds more than ${String(MAX_VOICES)} notes at once, cutting the oldest`, () => {
      const { player, contexts } = setup();
      player.configure({ pack: 'mechanical', volume: 50 });
      for (let note = 0; note < 20; note += 1) {
        player.play('hit');
        expect(player.activeVoices).toBeLessThanOrEqual(MAX_VOICES);
      }
      const context = only(contexts);
      expect(context.sources).toHaveLength(20);
      // The first twelve were cut, in order; the last eight are still sounding.
      expect(context.sources.slice(0, 12).every((source) => source.stoppedAt !== null)).toBe(true);
      expect(context.sources.slice(12).every((source) => source.stoppedAt === null)).toBe(true);
      expect(player.activeVoices).toBe(MAX_VOICES);
    });

    it('cuts with a short fade rather than a click', () => {
      const { player, contexts } = setup();
      player.configure({ pack: 'mechanical', volume: 50 });
      for (let note = 0; note < MAX_VOICES + 1; note += 1) player.play('hit');
      const made = only(contexts);
      const cut = made.sources[0];
      const fadedGain = made.gains[1];
      if (cut === undefined || fadedGain === undefined) throw new Error('nothing was played');
      expect(cut.stoppedAt).toBeGreaterThan(0);
      expect(cut.stoppedAt).toBeLessThan(0.02);
      expect(fadedGain.gain.ramps).toEqual([{ value: 0, time: cut.stoppedAt }]);
    });

    it('frees a place when a note ends by itself, so nothing is cut needlessly', () => {
      const { player, contexts } = setup();
      player.configure({ pack: 'beep', volume: 50 });
      for (let note = 0; note < MAX_VOICES; note += 1) player.play('hit');
      const context = only(contexts);
      context.sources[0]?.finish();
      context.sources[1]?.finish();
      expect(player.activeVoices).toBe(MAX_VOICES - 2);
      player.play('hit');
      player.play('hit');
      expect(context.sources.every((source) => source.stoppedAt === null)).toBe(true);
      expect(player.activeVoices).toBe(MAX_VOICES);
    });

    it('lets a cut note finish quietly without freeing a second place', () => {
      const { player, contexts } = setup();
      player.configure({ pack: 'beep', volume: 50 });
      for (let note = 0; note < MAX_VOICES + 1; note += 1) player.play('hit');
      const context = only(contexts);
      context.sources[0]?.finish();
      expect(player.activeVoices).toBe(MAX_VOICES);
    });
  });

  describe('when audio is not possible', () => {
    it('carries on silently if the browser has no Web Audio', () => {
      let attempts = 0;
      const player = new SoundPlayer(() => {
        attempts += 1;
        throw new Error('no AudioContext');
      });
      player.configure({ pack: 'beep', volume: 50 });
      expect(() => {
        player.play('hit');
        player.play('miss');
        player.unlock();
      }).not.toThrow();
      expect(player.available).toBe(false);
      // It does not try again on every key.
      expect(attempts).toBe(1);
    });

    it('carries on if resuming the context is refused', async () => {
      const contexts: FakeContext[] = [];
      const player = new SoundPlayer(() => {
        const context = new FakeContext();
        context.resume = () => Promise.reject(new Error('not allowed'));
        contexts.push(context);
        return context;
      });
      player.configure({ pack: 'beep', volume: 50 });
      expect(() => {
        player.play('hit');
      }).not.toThrow();
      await Promise.resolve();
      expect(player.available).toBe(true);
    });
  });

  it('closes the context when disposed, and makes a new one for a later sound', () => {
    const { player, contexts } = setup();
    player.configure({ pack: 'beep', volume: 50 });
    player.play('hit');
    player.dispose();
    expect(only(contexts).closed).toBe(true);
    expect(player.activeVoices).toBe(0);
    player.play('hit');
    expect(contexts).toHaveLength(2);
  });
});
