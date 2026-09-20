import { describe, expect, it } from 'vitest';

import { synthesize, type AudibleSoundPack, type SoundKind } from '../src/features/sound/synth';

const PACKS: AudibleSoundPack[] = ['mechanical', 'soft', 'beep'];
const KINDS: SoundKind[] = ['hit', 'miss'];
const RATES = [44100, 48000];

const peak = (samples: Float32Array) =>
  samples.reduce((loudest, s) => Math.max(loudest, Math.abs(s)), 0);
/** Sign changes per second: a crude pitch, higher for a brighter sound. */
const crossingsPerSecond = (samples: Float32Array, rate: number) => {
  let crossings = 0;
  for (let index = 1; index < samples.length; index += 1) {
    if ((samples[index - 1] ?? 0) < 0 !== (samples[index] ?? 0) < 0) crossings += 1;
  }
  return (crossings * rate) / samples.length;
};

describe.each(PACKS)('the %s pack', (pack) => {
  describe.each(KINDS)('%s', (kind) => {
    it.each(RATES)('is a short, audible, finite sound at %i Hz', (rate) => {
      const samples = synthesize(pack, kind, rate);
      expect(samples.length).toBeGreaterThan(rate * 0.03);
      expect(samples.length).toBeLessThan(rate * 0.15);
      expect(peak(samples)).toBeGreaterThan(0.25);
      expect(peak(samples)).toBeLessThanOrEqual(0.9 + 1e-6);
      expect(samples.every(Number.isFinite)).toBe(true);
    });

    it('starts and ends at silence, so cutting or ending it never clicks', () => {
      const samples = synthesize(pack, kind, 48000);
      const loudest = peak(samples);
      expect(Math.abs(samples[0] ?? 1)).toBeLessThan(loudest * 0.05);
      expect(samples[samples.length - 1]).toBe(0);
      // The last few milliseconds are quiet, not just the last sample.
      const tail = samples.slice(samples.length - Math.round(0.003 * 48000));
      expect(peak(tail)).toBeLessThan(loudest * 0.5);
    });

    it('is the same every time, so it sounds the same on every device', () => {
      expect(Array.from(synthesize(pack, kind, 48000))).toEqual(
        Array.from(synthesize(pack, kind, 48000)),
      );
    });
  });

  it('makes a miss softer and lower than a hit (§8.3: never unpleasant)', () => {
    // Softer is judged by peak amplitude, not RMS: a click is a short transient, so a longer,
    // gentler miss can carry more total energy than the hit and still be far quieter at its peak.
    const hit = synthesize(pack, 'hit', 48000);
    const miss = synthesize(pack, 'miss', 48000);
    expect(peak(miss)).toBeLessThanOrEqual(peak(hit) * 0.5);
    expect(crossingsPerSecond(miss, 48000)).toBeLessThan(crossingsPerSecond(hit, 48000));
  });
});

describe('the packs together', () => {
  it('sound different from one another', () => {
    for (const kind of KINDS) {
      const sounds = PACKS.map((pack) => Array.from(synthesize(pack, kind, 48000).slice(0, 200)));
      for (let first = 0; first < sounds.length; first += 1) {
        for (let second = first + 1; second < sounds.length; second += 1) {
          expect(sounds[first]).not.toEqual(sounds[second]);
        }
      }
    }
  });

  it('keep a hit above the pitch of a miss in the beep pack exactly: 880 Hz against 300 Hz', () => {
    const hit = crossingsPerSecond(synthesize('beep', 'hit', 48000), 48000) / 2;
    const miss = crossingsPerSecond(synthesize('beep', 'miss', 48000), 48000) / 2;
    expect(hit).toBeGreaterThan(800);
    expect(hit).toBeLessThan(960);
    expect(miss).toBeGreaterThan(250);
    expect(miss).toBeLessThan(350);
  });
});
