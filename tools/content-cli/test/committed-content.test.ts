import { readFileSync } from 'node:fs';

import { ContentBundleSchema, TRACK_POOLS, type ContentBundle } from '@typing-trainer/contracts';
import { createEngineState, handleKey, isComplete } from '@typing-trainer/typing-engine';
import { describe, expect, it } from 'vitest';

/**
 * The natural-language content as committed (§13.4): each pool is large enough for a run to draw
 * without repeating a block (§13.7), and every block can be finished by typing its text.
 */

const RUN_BLOCKS = { word: 300, line: 80, paragraph: 20 } as const;

const bundle = (pool: string): ContentBundle =>
  ContentBundleSchema.parse(
    JSON.parse(
      readFileSync(new URL(`../../../content/dist/${pool}.bundle.json`, import.meta.url), 'utf8'),
    ),
  );

describe.each(TRACK_POOLS['natural-en'])('the committed %s bundle', (pool) => {
  const kind = pool.slice(pool.indexOf('-') + 1) as keyof typeof RUN_BLOCKS;
  const { blocks } = bundle(pool);

  it('holds at least as many blocks as a run draws', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(RUN_BLOCKS[kind]);
  });

  it('has ids made of the pool and eight hex digits', () => {
    for (const block of blocks) expect(block.blockId).toMatch(new RegExp(`^${pool}/[0-9a-f]{8}$`));
  });

  it('has blocks that are finished by typing their text, with no miss', () => {
    for (const block of blocks) {
      let state = createEngineState(block);
      for (const atom of block.atoms) {
        const keys =
          atom.kind === 'literal'
            ? Array.from(atom.text)
            : atom.kind === 'separator'
              ? [atom.canonical === '\n' ? 'Enter' : ' ']
              : [];
        for (const key of keys) {
          const result = handleKey(state, key);
          expect(result.verdict, `${block.blockId} at "${key}"`).toBe('CORRECT');
          state = result.state;
        }
      }
      expect(isComplete(state), block.blockId).toBe(true);
      expect(state.counters, block.blockId).toMatchObject({
        miss: 0,
        effective: block.canonicalKeystrokes,
      });
    }
  });
});
