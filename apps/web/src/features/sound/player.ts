import type { SoundPack } from '@typing-trainer/contracts';

import { synthesize, type AudibleSoundPack, type SoundKind } from './synth';

/**
 * The part of the Web Audio API this player uses, so a test can stand in for a browser. The real
 * `AudioContext` satisfies it.
 */
export interface AudioContextLike {
  readonly sampleRate: number;
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  resume(): Promise<void>;
  close(): Promise<void>;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  createGain(): GainNodeLike;
  createBufferSource(): BufferSourceLike;
}

export interface AudioBufferLike {
  getChannelData(channel: number): Float32Array;
}

export interface GainNodeLike {
  readonly gain: {
    value: number;
    cancelScheduledValues(time: number): void;
    setValueAtTime(value: number, time: number): void;
    linearRampToValueAtTime(value: number, time: number): void;
  };
  connect(destination: unknown): void;
  disconnect(): void;
}

export interface BufferSourceLike {
  buffer: AudioBufferLike | null;
  onended: (() => void) | null;
  connect(destination: unknown): void;
  disconnect(): void;
  start(when?: number): void;
  stop(when?: number): void;
}

/** §8.3: a voice pool capped at 8, cutting the oldest note, so rapid typing does not pile up. */
export const MAX_VOICES = 8;

/** How long a voice cut short takes to fade, in seconds: quick, but not a click. */
const CUT_FADE_SECONDS = 0.005;

export interface SoundSettings {
  readonly pack: SoundPack;
  /** 0 to 100. */
  readonly volume: number;
}

interface Voice {
  readonly source: BufferSourceLike;
  readonly gain: GainNodeLike;
}

/**
 * Plays the key sounds (§8.3) with the Web Audio API: pre-built `AudioBuffer`s, played through a
 * pool of at most eight voices into one master gain. Nothing is created until a sound is wanted, and
 * with the pack off, or the volume at zero, nothing ever is.
 *
 * Browsers refuse to start audio before a user gesture, so the context is created and resumed by
 * `play` or `unlock`, which the play screen calls from the key press itself, and the settings screen
 * from a click.
 */
export class SoundPlayer {
  private settings: SoundSettings = { pack: 'off', volume: 0 };
  private context: AudioContextLike | null = null;
  private master: GainNodeLike | null = null;
  private unavailable = false;
  private readonly buffers = new Map<string, AudioBufferLike>();
  private readonly voices: Voice[] = [];

  constructor(private readonly createContext: () => AudioContextLike) {}

  /** Whether the browser could make an audio context; false once creating one has failed. */
  get available(): boolean {
    return !this.unavailable;
  }

  /** Applies new settings at once, including to notes that are already sounding. */
  configure(settings: SoundSettings): void {
    this.settings = settings;
    if (this.master !== null) this.master.gain.value = loudness(settings.volume);
  }

  /** Starts the audio context from a user gesture, without making a sound; nothing if off. */
  unlock(): void {
    if (!this.audible()) return;
    this.ensureContext();
  }

  /**
   * Gets ready to sound: starts the context and builds both sounds of the pack, so the first key of
   * a run has nothing to do but start a note. Measured in a browser, making the context and the
   * first buffer on the first key took about 30 ms, nearly all of §9.6's 33 ms. Called when the
   * play screen opens, after the click that started the run. Nothing if the pack is off.
   */
  prepare(): void {
    if (!this.audible()) return;
    const { pack } = this.settings;
    if (pack === 'off') return;
    const context = this.ensureContext();
    if (context === null) return;
    this.buffer(context, pack, 'hit');
    this.buffer(context, pack, 'miss');
  }

  play(kind: SoundKind): void {
    if (!this.audible()) return;
    const { pack } = this.settings;
    if (pack === 'off') return;
    const context = this.ensureContext();
    if (context === null) return;

    const buffer = this.buffer(context, pack, kind);
    if (this.voices.length >= MAX_VOICES) this.cutOldest(context);

    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.master);
    const voice: Voice = { source, gain };
    source.onended = () => {
      const at = this.voices.indexOf(voice);
      if (at !== -1) this.voices.splice(at, 1);
      source.disconnect();
      gain.disconnect();
    };
    this.voices.push(voice);
    source.start(0);
  }

  /** Releases the audio context; a later `play` makes a new one. */
  dispose(): void {
    const context = this.context;
    this.voices.length = 0;
    this.buffers.clear();
    this.master = null;
    this.context = null;
    if (context !== null) void context.close().catch(() => undefined);
  }

  /** The notes sounding now, oldest first; for tests. */
  get activeVoices(): number {
    return this.voices.length;
  }

  /** Whether the settings would make a sound at all. */
  private audible(): boolean {
    return this.settings.pack !== 'off' && this.settings.volume > 0;
  }

  private ensureContext(): AudioContextLike | null {
    if (this.unavailable) return null;
    if (this.context === null) {
      try {
        const context = this.createContext();
        const master = context.createGain();
        master.gain.value = loudness(this.settings.volume);
        master.connect(context.destination);
        this.context = context;
        this.master = master;
      } catch {
        // No Web Audio, or it refused: the app works without sound.
        this.unavailable = true;
        return null;
      }
    }
    // The first gesture starts a context the browser created suspended.
    if (this.context.state !== 'running') void this.context.resume().catch(() => undefined);
    return this.context;
  }

  private buffer(
    context: AudioContextLike,
    pack: AudibleSoundPack,
    kind: SoundKind,
  ): AudioBufferLike {
    const key = `${pack}:${kind}`;
    let buffer = this.buffers.get(key);
    if (buffer === undefined) {
      const samples = synthesize(pack, kind, context.sampleRate);
      buffer = context.createBuffer(1, samples.length, context.sampleRate);
      buffer.getChannelData(0).set(samples);
      this.buffers.set(key, buffer);
    }
    return buffer;
  }

  /** Fades out and stops the longest-sounding note to make room for a new one. */
  private cutOldest(context: AudioContextLike): void {
    const oldest = this.voices.shift();
    if (oldest === undefined) return;
    const now = context.currentTime;
    oldest.source.onended = null;
    oldest.gain.gain.cancelScheduledValues(now);
    oldest.gain.gain.setValueAtTime(oldest.gain.gain.value, now);
    oldest.gain.gain.linearRampToValueAtTime(0, now + CUT_FADE_SECONDS);
    oldest.source.stop(now + CUT_FADE_SECONDS);
    oldest.source.onended = () => {
      oldest.source.disconnect();
      oldest.gain.disconnect();
    };
  }
}

/** The master gain for a volume of 0 to 100: squared, since loudness is heard on a curve. */
export function loudness(volume: number): number {
  const level = Math.min(100, Math.max(0, volume)) / 100;
  return level * level;
}
