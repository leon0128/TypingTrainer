import { compileBlock, typescriptAdapter } from '@typing-trainer/block-compiler';
import { TypingProgramSchema } from '@typing-trainer/contracts';
import { describe, expect, it } from 'vitest';

import demoSource from '../../../content/blocks/typescript/p0-demo.ts?raw';
import { DEMO_PROGRAM } from '../src/features/play/demo-program';

// Fixed literal, deliberately not read from DEMO_PROGRAM: a wrong DEMO_PROGRAM.blockId would
// otherwise be fed to both sides of the comparison and go unnoticed.
const BLOCK_ID = 'p0-demo';

describe('DEMO_PROGRAM', () => {
  it('uses the expected block id', () => {
    expect(DEMO_PROGRAM.blockId).toBe(BLOCK_ID);
  });

  it('equals the block compiler output for content/blocks/typescript/p0-demo.ts', () => {
    expect(compileBlock(demoSource, typescriptAdapter, BLOCK_ID)).toEqual(DEMO_PROGRAM);
  });

  it('satisfies TypingProgramSchema', () => {
    expect(TypingProgramSchema.safeParse(DEMO_PROGRAM).error?.issues ?? []).toEqual([]);
  });
});
