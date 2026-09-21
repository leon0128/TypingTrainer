import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { MAX_SEED, RUN_BLOCK_COUNTS, drawBlockIds, runBlockCount } from '../src';

const pool = (size: number) =>
  Array.from({ length: size }, (_, index) => `go/block-${String(index).padStart(2, '0')}`);

const seedArbitrary = fc.bigInt({ min: 0n, max: MAX_SEED });

describe('drawBlockIds', () => {
  it('issues the blocks a run of the pool takes: 20 for code and a paragraph, and more for shorter text', () => {
    expect(runBlockCount(null)).toBe(20);
    expect(runBlockCount('paragraph')).toBe(20);
    expect(runBlockCount('line')).toBe(80);
    expect(runBlockCount('word')).toBe(300);
    expect(RUN_BLOCK_COUNTS).toEqual({ code: 20, word: 300, line: 80, paragraph: 20 });
    for (const count of [runBlockCount(null), runBlockCount('word'), runBlockCount('line')]) {
      expect(drawBlockIds(pool(500), 1n, count)).toHaveLength(count);
    }
  });

  it('draws a whole run without a repeat when the pool is at least as large as the run', () => {
    for (const kind of ['word', 'line', 'paragraph'] as const) {
      const count = runBlockCount(kind);
      const drawn = drawBlockIds(pool(count), 7n, count);
      expect(new Set(drawn).size).toBe(count);
    }
  });

  it('keeps the sequence of a seed stable across releases', () => {
    // Pinned so a change to the generator or the shuffle cannot silently alter stored runs, which
    // are reproduced from their seed and content revision.
    expect(drawBlockIds(pool(50), 42n, 8)).toMatchInlineSnapshot(`
      [
        "go/block-43",
        "go/block-14",
        "go/block-47",
        "go/block-23",
        "go/block-33",
        "go/block-38",
        "go/block-18",
        "go/block-44",
      ]
    `);
    expect(drawBlockIds(pool(3), 42n, 8)).toMatchInlineSnapshot(`
      [
        "go/block-00",
        "go/block-01",
        "go/block-02",
        "go/block-01",
        "go/block-00",
        "go/block-02",
        "go/block-00",
        "go/block-02",
      ]
    `);
  });

  it('depends only on the seed, not on the order of the pool', () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 2, max: 60 })
          .chain((size) =>
            fc.tuple(fc.constant(pool(size)), fc.shuffledSubarray(pool(size), { minLength: size })),
          ),
        seedArbitrary,
        ([sorted, reordered], seed) => {
          expect(drawBlockIds(reordered, seed, 30)).toEqual(drawBlockIds(sorted, seed, 30));
        },
      ),
    );
  });

  it('draws from the pool without repeats until it is used up, and never repeats a block twice in a row', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 60 }),
        fc.integer({ min: 1, max: 150 }),
        seedArbitrary,
        (size, count, seed) => {
          const ids = pool(size);
          const drawn = drawBlockIds(ids, seed, count);
          expect(drawn).toHaveLength(count);
          for (const id of drawn) expect(ids).toContain(id);
          for (let start = 0; start < count; start += size) {
            const cycle = drawn.slice(start, start + size);
            expect(new Set(cycle).size).toBe(cycle.length);
          }
          drawn.forEach((id, index) => {
            if (index > 0) expect(id).not.toBe(drawn[index - 1]);
          });
        },
      ),
    );
  });

  it('refuses pools and counts it cannot draw from', () => {
    expect(() => drawBlockIds([], 1n, RUN_BLOCK_COUNTS.code)).toThrow(/empty/);
    expect(() => drawBlockIds(['go/a', 'go/a'], 1n, RUN_BLOCK_COUNTS.code)).toThrow(/duplicate/);
    expect(() => drawBlockIds(['go/a'], 1n, 2)).toThrow(/single-block/);
    expect(drawBlockIds(['go/a'], 1n, 1)).toEqual(['go/a']);
    expect(() => drawBlockIds(pool(5), 1n, 0)).toThrow(RangeError);
    expect(() => drawBlockIds(pool(5), -1n, RUN_BLOCK_COUNTS.code)).toThrow(RangeError);
  });
});
