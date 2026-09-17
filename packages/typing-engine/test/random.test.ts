import { describe, expect, it } from 'vitest';

import { MAX_SEED, createSeededRandom } from '../src';

/**
 * The first eight outputs after seeding, produced by bryc's sfc32 copied verbatim from
 * https://raw.githubusercontent.com/bryc/code/master/jshash/PRNGs.md and seeded with PractRand's
 * sfc32::seed(Uint64) from the same file (a = 0, b = low 32 bits, c = high 32 bits, counter = 1,
 * 12 outputs discarded). Not generated with the implementation under test.
 */
const REFERENCE_OUTPUTS: readonly [bigint, readonly number[]][] = [
  [
    0n,
    [1363572419, 145230303, 808754475, 4216505632, 947923937, 2491578854, 3964400089, 2091952393],
  ],
  [
    1n,
    [
      2012149540, 1872316204, 1707632675, 1779833415, 2026416846, 1661539736, 2729060721,
      4156309426,
    ],
  ],
  [
    42n,
    [1264412219, 1947509147, 3919439299, 1251167922, 656401615, 478193053, 3278332503, 1360198844],
  ],
  [
    0x0123456789abcdefn,
    [2222009751, 4121156040, 1557176981, 903895892, 1281522849, 866141154, 3054582887, 2091619993],
  ],
  [
    MAX_SEED,
    [370515012, 1336247968, 1286944092, 1801097525, 2563487965, 3958890920, 2176453897, 2203340088],
  ],
];

describe('createSeededRandom', () => {
  it.each(REFERENCE_OUTPUTS)('matches the reference sfc32 for seed %s', (seed, expected) => {
    const random = createSeededRandom(seed);
    expect(expected.map(() => random.nextUint32())).toEqual(expected);
  });

  it('accepts only seeds that fit a signed 64-bit column', () => {
    expect(() => createSeededRandom(-1n)).toThrow(RangeError);
    expect(() => createSeededRandom(MAX_SEED + 1n)).toThrow(RangeError);
  });

  it('draws bounded integers uniformly', () => {
    const random = createSeededRandom(7n);
    const counts = [0, 0, 0, 0, 0];
    const draws = 50_000;
    for (let draw = 0; draw < draws; draw += 1) {
      const value = random.nextInt(5);
      counts[value] = (counts[value] ?? 0) + 1;
    }
    // Chi-square with 4 degrees of freedom; 18.47 is the 0.1% critical value.
    const expected = draws / counts.length;
    const chiSquare = counts.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);
    expect(chiSquare).toBeLessThan(18.47);
  });

  it('rejects outputs above the largest multiple of the bound', () => {
    // With bound 2^32 − 1 the only rejected output is 2^32 − 1 itself; results stay in range.
    const random = createSeededRandom(3n);
    for (let draw = 0; draw < 1000; draw += 1) {
      expect(random.nextInt(0xffff_ffff)).toBeLessThan(0xffff_ffff);
    }
    expect(createSeededRandom(3n).nextInt(1)).toBe(0);
  });

  it('refuses bounds that are not integers from 1 to 2^32', () => {
    const random = createSeededRandom(0n);
    for (const bound of [0, -1, 1.5, 0x1_0000_0001, Number.NaN]) {
      expect(() => random.nextInt(bound)).toThrow(RangeError);
    }
  });
});
