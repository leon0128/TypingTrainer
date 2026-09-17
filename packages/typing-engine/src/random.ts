/**
 * Seeded pseudo-random numbers (§5.3), identical wherever they run: the server draws a run's blocks
 * from the stored seed, and later opponents (§4.3) can reproduce the same sequence.
 *
 * The generator is Chris Doty-Humphrey's SFC32 from PractRand, seeded as PractRand's
 * `sfc32::seed(Uint64)` does: a = 0, b = the low 32 bits, c = the high 32 bits, counter = 1, then
 * 12 outputs discarded. Not for secrets; seeds themselves come from a cryptographic source.
 */

/** Seeds are stored in a signed 64-bit column (`rng_seed bigint`), so they are 0 to 2^63 − 1. */
export const MAX_SEED = (1n << 63n) - 1n;

const TWO_TO_32 = 0x1_0000_0000;

export interface SeededRandom {
  /** The next 32-bit output, 0 to 2^32 − 1. */
  nextUint32(): number;
  /** A uniform integer from 0 to bound − 1, without modulo bias; bound is 1 to 2^32. */
  nextInt(bound: number): number;
}

export function createSeededRandom(seed: bigint): SeededRandom {
  if (seed < 0n || seed > MAX_SEED) {
    throw new RangeError(`A seed is an integer from 0 to ${MAX_SEED.toString()}`);
  }
  let a = 0;
  let b = Number(seed & 0xffff_ffffn) | 0;
  let c = Number((seed >> 32n) & 0xffff_ffffn) | 0;
  let counter = 1;

  const nextUint32 = (): number => {
    const t = (((a + b) | 0) + counter) | 0;
    counter = (counter + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let round = 0; round < 12; round += 1) nextUint32();

  return {
    nextUint32,
    nextInt(bound: number): number {
      if (!Number.isInteger(bound) || bound < 1 || bound > TWO_TO_32) {
        throw new RangeError(`A bound is an integer from 1 to 2^32, not ${String(bound)}`);
      }
      // Reject the top partial range so every result is equally likely.
      const limit = TWO_TO_32 - (TWO_TO_32 % bound);
      for (;;) {
        const value = nextUint32();
        if (value < limit) return value % bound;
      }
    },
  };
}
