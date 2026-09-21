import { readFileSync } from 'node:fs';

import {
  ContentBundleSchema,
  TRACK_POOLS,
  countMaxKeystrokes,
  type ContentBundle,
  type TypingProgram,
} from '@typing-trainer/contracts';
import { cpuKeys, createEngineState, handleKey, isComplete } from '@typing-trainer/typing-engine';
import { describe, expect, it } from 'vitest';

/**
 * The natural-language content as committed (§13.4): each pool is large enough for a run to draw
 * without repeating a block (§13.7), and every block can be finished by typing it.
 */

const RUN_BLOCKS = { word: 300, line: 80, paragraph: 20 } as const;

/** The keys that type a block as it is shown: the first spelling of every Japanese unit. */
const shownKeys = (block: TypingProgram): string[] =>
  block.atoms.flatMap((atom) => {
    if (atom.kind === 'literal') return Array.from(atom.text);
    if (atom.kind === 'romaji') return Array.from(atom.alternatives[0] ?? '');
    if (atom.kind === 'separator') return [atom.canonical === '\n' ? 'Enter' : ' '];
    return [];
  });

const bundle = (pool: string): ContentBundle =>
  ContentBundleSchema.parse(
    JSON.parse(
      readFileSync(new URL(`../../../content/dist/${pool}.bundle.json`, import.meta.url), 'utf8'),
    ),
  );

describe.each([...TRACK_POOLS['natural-en'], ...TRACK_POOLS['natural-ja']])(
  'the committed %s bundle',
  (pool) => {
    const kind = pool.slice(pool.indexOf('-') + 1) as keyof typeof RUN_BLOCKS;
    const { blocks } = bundle(pool);

    it('holds at least as many blocks as a run draws', () => {
      expect(blocks.length).toBeGreaterThanOrEqual(RUN_BLOCKS[kind]);
    });

    it('has ids made of the pool and eight hex digits', () => {
      for (const block of blocks)
        expect(block.blockId).toMatch(new RegExp(`^${pool}/[0-9a-f]{8}$`));
    });

    it('has blocks that are finished by typing them as shown, within the most keys they allow', () => {
      for (const block of blocks) {
        let state = createEngineState(block);
        const keys = shownKeys(block);
        for (const key of keys) {
          const result = handleKey(state, key);
          expect(result.verdict, `${block.blockId} at "${key}"`).toBe('CORRECT');
          state = result.state;
        }
        expect(isComplete(state), block.blockId).toBe(true);
        expect(state.counters.miss, block.blockId).toBe(0);
        expect(keys.length, block.blockId).toBeLessThanOrEqual(countMaxKeystrokes(block.atoms));
        expect(keys.length, block.blockId).toBeGreaterThanOrEqual(block.canonicalKeystrokes);
      }
    });

    it('has blocks that are finished by typing them the shortest way, with no miss', () => {
      // What the CPU types: the text of English, and the shortest spelling of every Japanese unit.
      for (const block of blocks) {
        let state = createEngineState(block);
        for (const key of cpuKeys([block])) {
          const result = handleKey(state, key);
          expect(result.verdict, `${block.blockId} at "${key}"`).toBe('CORRECT');
          state = result.state;
        }
        expect(isComplete(state), block.blockId).toBe(true);
        expect(state.counters, block.blockId).toMatchObject({
          miss: 0,
          effective: block.canonicalKeystrokes,
        });
      }
    });
  },
);
