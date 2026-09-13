import { describe, expect, it } from 'vitest';

import { ContentBundleSchema, canonicalBlocksJson, type TypingProgram } from '../src';

const block = (blockId: string): TypingProgram => ({
  blockId,
  atoms: [{ kind: 'literal', text: 'x' }],
  canonicalKeystrokes: 1,
});

const bundle = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  language: 'go',
  revision: 'a'.repeat(64),
  blocks: [block('go/alpha'), block('go/beta')],
  ...overrides,
});

describe('ContentBundleSchema', () => {
  it('accepts a sorted bundle of valid blocks', () => {
    expect(ContentBundleSchema.safeParse(bundle()).success).toBe(true);
  });

  it('rejects blocks of another language, unsorted or duplicate ids, and bad revisions', () => {
    const messages = (input: unknown) =>
      ContentBundleSchema.safeParse(input).error?.issues.map((issue) => issue.message) ?? [];
    expect(messages(bundle({ blocks: [block('java/alpha')] }))).toContain(
      'blockId must start with "go/"',
    );
    expect(messages(bundle({ blocks: [block('go/beta'), block('go/alpha')] }))).toContain(
      'blocks must be sorted by blockId without duplicates',
    );
    expect(messages(bundle({ blocks: [block('go/alpha'), block('go/alpha')] }))).toContain(
      'blocks must be sorted by blockId without duplicates',
    );
    expect(ContentBundleSchema.safeParse(bundle({ revision: 'ABC' })).success).toBe(false);
    expect(ContentBundleSchema.safeParse(bundle({ blocks: [] })).success).toBe(false);
    expect(ContentBundleSchema.safeParse(bundle({ language: 'rust' })).success).toBe(false);
  });
});

describe('canonicalBlocksJson', () => {
  it('uses a fixed key order regardless of how the objects were built', () => {
    const shuffled = {
      canonicalKeystrokes: 2,
      atoms: [
        { text: '(', kind: 'literal' },
        { filledBy: 0, text: ')', kind: 'auto' },
        { required: false, canonical: ' ', kind: 'separator' },
        { text: 'y', kind: 'literal' },
      ],
      blockId: 'go/a',
    } as unknown as TypingProgram;
    expect(canonicalBlocksJson([shuffled])).toBe(
      '[{"blockId":"go/a","canonicalKeystrokes":2,"atoms":[{"kind":"literal","text":"("},' +
        '{"kind":"auto","text":")","filledBy":0},{"kind":"separator","canonical":" ","required":false},' +
        '{"kind":"literal","text":"y"}]}]',
    );
  });
});
