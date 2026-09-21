import { describe, expect, it } from 'vitest';

import {
  ContentBundleSchema,
  TypingProgramSchema,
  canonicalBlocksJson,
  countCanonicalKeystrokes,
  countMaxKeystrokes,
  shortestSpelling,
  type Atom,
  type TypingProgram,
} from '../src';

const romaji = (display: string, ...alternatives: string[]): Atom => ({
  kind: 'romaji',
  display,
  alternatives,
});
const NL: Atom = { kind: 'separator', canonical: '\n', required: true };
const literal = (text: string): Atom => ({ kind: 'literal', text });

const SHI = romaji('し', 'shi', 'si');
const KA = romaji('か', 'ka');
const N = romaji('ん', 'n', 'nn', "n'", 'xn');

const programOf = (atoms: Atom[], canonicalKeystrokes?: number): TypingProgram => ({
  blockId: 'ja-word/probe',
  atoms,
  canonicalKeystrokes: canonicalKeystrokes ?? countCanonicalKeystrokes(atoms),
});

const issues = (input: unknown) =>
  TypingProgramSchema.safeParse(input).error?.issues.map((issue) => issue.message) ?? [];

describe('counting a romaji program', () => {
  it('takes the shortest spelling for the canonical count and the longest for the maximum', () => {
    const atoms = [SHI, KA, NL, N, KA];
    expect(countCanonicalKeystrokes(atoms)).toBe(2 + 2 + 1 + 1 + 2);
    expect(countMaxKeystrokes(atoms)).toBe(3 + 2 + 1 + 2 + 2);
  });

  it('counts literals and separators alike in both, so code and English need no second number', () => {
    const atoms = [
      literal('abc'),
      { kind: 'separator', canonical: ' ', required: true },
      literal('d'),
    ] as Atom[];
    expect(countMaxKeystrokes(atoms)).toBe(countCanonicalKeystrokes(atoms));
  });

  it('shows the first of the shortest spellings', () => {
    expect(shortestSpelling({ kind: 'romaji', display: 'じ', alternatives: ['ji', 'zi'] })).toBe(
      'ji',
    );
    expect(shortestSpelling({ kind: 'romaji', display: 'し', alternatives: ['shi', 'si'] })).toBe(
      'si',
    );
  });
});

describe('TypingProgramSchema with romaji units', () => {
  it('accepts a program of units and line breaks, and one that starts with a unit', () => {
    expect(TypingProgramSchema.safeParse(programOf([SHI, KA, NL, N, KA])).success).toBe(true);
  });

  it('keeps canonicalKeystrokes equal to the shortest way', () => {
    expect(issues(programOf([SHI, KA], 5))[0]).toMatch(
      /canonicalKeystrokes is 5 but the atoms add up to 4/,
    );
  });

  it.each([
    ['an uppercase letter', ['Shi']],
    ['a space', ['sh i']],
    ['a digit', ['shi1']],
    ['an empty spelling', ['']],
    ['a Japanese character', ['し']],
  ])('refuses %s in a spelling', (_description, spellings) => {
    expect(TypingProgramSchema.safeParse(programOf([romaji('し', ...spellings)], 3)).success).toBe(
      false,
    );
  });

  it("accepts the keys of ー、。 and the apostrophe of n'", () => {
    expect(
      TypingProgramSchema.safeParse(
        programOf([romaji('ー', '-'), romaji('、', ','), romaji('。', '.'), N, KA]),
      ).success,
    ).toBe(true);
  });

  it('refuses a unit with no spelling, and one with a spelling twice', () => {
    expect(
      TypingProgramSchema.safeParse({ ...programOf([KA]), atoms: [romaji('か')] }).success,
    ).toBe(false);
    expect(issues(programOf([romaji('か', 'ka', 'ka')]))).toContain(
      'the spellings of a romaji unit must be distinct',
    );
  });

  it('refuses a unit that could not be completed: a spelling another extends, with nothing typed after', () => {
    expect(issues(programOf([KA, N]))).toContain(
      'a romaji unit with a spelling that is a prefix of another must be followed by something typed',
    );
    expect(TypingProgramSchema.safeParse(programOf([KA, N, NL, KA])).success).toBe(true);
    expect(TypingProgramSchema.safeParse(programOf([KA, N, literal('a')])).success).toBe(true);
  });

  it('counts a unit as something a required space is followed by', () => {
    const atoms: Atom[] = [literal('a'), { kind: 'separator', canonical: ' ', required: true }, KA];
    expect(TypingProgramSchema.safeParse(programOf(atoms)).success).toBe(true);
  });
});

describe('a content bundle of romaji units', () => {
  const block = (blockId: string, atoms: Atom[]): TypingProgram => ({
    blockId,
    atoms,
    canonicalKeystrokes: countCanonicalKeystrokes(atoms),
  });
  const bundle = (language: string, blocks: TypingProgram[]) => ({
    schemaVersion: 1,
    language,
    revision: 'a'.repeat(64),
    blocks,
  });
  const messages = (input: unknown) =>
    ContentBundleSchema.safeParse(input).error?.issues.map((issue) => issue.message) ?? [];

  it('is accepted for a Japanese pool, in words and in paragraphs', () => {
    expect(
      ContentBundleSchema.safeParse(bundle('ja-word', [block('ja-word/0001', [SHI, KA])])).success,
    ).toBe(true);
    expect(
      ContentBundleSchema.safeParse(
        bundle('ja-paragraph', [block('ja-paragraph/0001', [SHI, NL, KA])]),
      ).success,
    ).toBe(true);
  });

  it('holds only romaji units and line breaks when Japanese', () => {
    expect(messages(bundle('ja-line', [block('ja-line/0001', [SHI, literal('a')])]))).toContain(
      'a Japanese block holds only romaji units and line breaks',
    );
    expect(
      messages(
        bundle('ja-line', [
          block('ja-line/0001', [SHI, { kind: 'separator', canonical: ' ', required: true }, KA]),
        ]),
      ),
    ).toContain('a Japanese block holds only romaji units and line breaks');
  });

  it.each(['typescript', 'go', 'en-word', 'en-paragraph'])(
    'is refused for the %s pool',
    (language) => {
      expect(messages(bundle(language, [block(`${language}/0001`, [SHI])]))).toContain(
        'only a Japanese block holds romaji units',
      );
    },
  );

  it('puts the units in the revision, so a changed spelling is a new revision', () => {
    const a = canonicalBlocksJson([block('ja-word/0001', [romaji('し', 'shi', 'si')])]);
    const b = canonicalBlocksJson([block('ja-word/0001', [romaji('し', 'si', 'shi')])]);
    const c = canonicalBlocksJson([block('ja-word/0001', [romaji('し', 'shi')])]);
    expect(new Set([a, b, c]).size).toBe(3);
    expect(a).toContain('"kind":"romaji","display":"し","alternatives":["shi","si"]');
  });
});
