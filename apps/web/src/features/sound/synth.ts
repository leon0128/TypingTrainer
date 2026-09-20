import type { SoundPack } from '@typing-trainer/contracts';

/** A key that was typed correctly, or one that missed (§8.3). */
export type SoundKind = 'hit' | 'miss';

/** The packs that make a sound; `off` makes none. */
export type AudibleSoundPack = Exclude<SoundPack, 'off'>;

interface Voice {
  readonly seconds: number;
  /** The loudest sample, 0 to 1. A miss is kept well under a hit: an unpleasant one discourages practice. */
  readonly peak: number;
  readonly attackSeconds: number;
  /** One sample of the raw sound at time `t`; `noise` is a fresh value from -1 to 1. */
  readonly sample: (t: number, noise: () => number) => number;
}

/** The end of every sound falls to zero over this long, so a voice cut short or ended never clicks. */
const RELEASE_SECONDS = 0.006;

const TAU = 2 * Math.PI;
const tone = (hz: number, t: number) => Math.sin(TAU * hz * t);
const decay = (t: number, seconds: number) => Math.exp(-t / seconds);

/**
 * A first-difference high-pass over the noise: the bright part of a click. Each call builds its own
 * state, so a sound is the same however often it is made.
 */
function brightNoise(): (noise: () => number) => number {
  let previous = 0;
  return (noise) => {
    const current = noise();
    const bright = current - previous;
    previous = current;
    return bright;
  };
}

/** A one-pole low-pass over the noise: the dull part of a thump. */
function dullNoise(amount: number): (noise: () => number) => number {
  let state = 0;
  return (noise) => {
    state += amount * (noise() - state);
    return state;
  };
}

function voices(): Record<AudibleSoundPack, Record<SoundKind, Voice>> {
  const mechanicalBright = brightNoise();
  const mechanicalMissDull = dullNoise(0.1);
  const softDull = dullNoise(0.15);
  return {
    // A switch: a bright click, a ringing top, and a low "thock" under them.
    mechanical: {
      hit: {
        seconds: 0.055,
        peak: 0.9,
        attackSeconds: 0.0003,
        sample: (t, noise) =>
          mechanicalBright(noise) * decay(t, 0.0035) +
          0.6 * tone(2400, t) * decay(t, 0.006) +
          0.5 * tone(180, t) * decay(t, 0.02),
      },
      miss: {
        seconds: 0.09,
        peak: 0.35,
        attackSeconds: 0.003,
        sample: (t, noise) =>
          0.8 * tone(150, t) * decay(t, 0.03) + 0.2 * mechanicalMissDull(noise) * decay(t, 0.02),
      },
    },
    // A cushioned key: a low thump with a little dull noise, no bright edge.
    soft: {
      hit: {
        seconds: 0.07,
        peak: 0.7,
        attackSeconds: 0.002,
        sample: (t, noise) =>
          0.6 * softDull(noise) * decay(t, 0.01) + tone(140, t) * decay(t, 0.02),
      },
      miss: {
        seconds: 0.1,
        peak: 0.3,
        attackSeconds: 0.006,
        sample: (t) => tone(110, t) * decay(t, 0.035),
      },
    },
    // A plain tone: high for a hit, low for a miss.
    beep: {
      hit: { seconds: 0.05, peak: 0.6, attackSeconds: 0.003, sample: (t) => tone(880, t) },
      miss: { seconds: 0.09, peak: 0.3, attackSeconds: 0.005, sample: (t) => tone(300, t) },
    },
  };
}

/** A small deterministic generator (mulberry32), so a sound is the same on every device and run. */
function seededNoise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return (((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

const SEEDS: Record<AudibleSoundPack, Record<SoundKind, number>> = {
  mechanical: { hit: 0x1001, miss: 0x1002 },
  soft: { hit: 0x2001, miss: 0x2002 },
  beep: { hit: 0x3001, miss: 0x3002 },
};

/**
 * The samples of one sound (§8.3), made in code instead of loaded from files: no licence to check,
 * nothing to download, and the same bytes everywhere, which is what lets a test pin them. The
 * result is shaped by a short attack and a release to zero, then scaled so its loudest sample is
 * the voice's `peak`.
 */
export function synthesize(
  pack: AudibleSoundPack,
  kind: SoundKind,
  sampleRate: number,
): Float32Array {
  const voice = voices()[pack][kind];
  const length = Math.round(voice.seconds * sampleRate);
  const noise = seededNoise(SEEDS[pack][kind]);
  const samples = new Float32Array(length);

  let loudest = 0;
  for (let index = 0; index < length; index += 1) {
    const t = index / sampleRate;
    const untilEnd = voice.seconds - t;
    const envelope = Math.min(1, t / voice.attackSeconds) * Math.min(1, untilEnd / RELEASE_SECONDS);
    const value = voice.sample(t, noise) * envelope;
    samples[index] = value;
    loudest = Math.max(loudest, Math.abs(value));
  }
  const scale = loudest === 0 ? 0 : voice.peak / loudest;
  for (let index = 0; index < length; index += 1) samples[index] = (samples[index] ?? 0) * scale;
  // The envelope reaches zero only at the very end; make the last sample exactly zero.
  if (length > 0) samples[length - 1] = 0;
  return samples;
}
