import { describe, expect, it } from 'vitest';

import { TypingProgramSchema, countCanonicalKeystrokes, type Atom } from '../src';

const L = (text: string): Atom => ({ kind: 'literal', text });
const A = (text: string, filledBy: number): Atom => ({ kind: 'auto', text, filledBy });
const S = (required: boolean): Atom => ({ kind: 'separator', canonical: ' ', required });
const NL: Atom = { kind: 'separator', canonical: '\n', required: true };

function program(atoms: Atom[], canonicalKeystrokes = countCanonicalKeystrokes(atoms)) {
  return { blockId: 'test', atoms, canonicalKeystrokes };
}

function issues(input: unknown): string[] {
  const result = TypingProgramSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('countCanonicalKeystrokes', () => {
  it('counts literal characters and separators, but not auto text', () => {
    // `f(x) {` + newline + indent + `y` + newline + `}`
    const atoms = [
      L('f'),
      L('('),
      L('x'),
      A(')', 1),
      S(false),
      L('{'),
      NL,
      A('  ', 6),
      L('y'),
      NL,
      A('}', 5),
    ];
    const literalChars = 'f(x{y'.length;
    const separators = 3;
    expect(countCanonicalKeystrokes(atoms)).toBe(literalChars + separators);
  });
});

describe('TypingProgramSchema', () => {
  it('accepts a well-formed program', () => {
    const atoms = [L('return'), S(true), L('{'), S(false), L('ok'), S(false), A('}', 2), NL];
    // A trailing line break needs a literal before the program is useful, but is structurally fine.
    expect(issues(program([...atoms, L('x')]))).toEqual([]);
  });

  it('rejects a canonicalKeystrokes mismatch', () => {
    expect(issues(program([L('abc')], 4))).toEqual([
      'canonicalKeystrokes is 4 but the atoms add up to 3',
    ]);
  });

  it('rejects a program whose first typed atom is a separator', () => {
    expect(issues(program([A('  ', 0), S(false), L('x')]))).toContain(
      'the first typed atom must be a literal',
    );
  });

  it('rejects filledBy pointing forward, at itself, or out of range', () => {
    const message = 'filledBy must point to an earlier literal or line-break separator atom';
    expect(issues(program([L('('), A(')', 1)]))).toContain(message);
    expect(issues(program([L('('), A(')', 2), L('x')]))).toContain(message);
    expect(issues(program([A(')', 5), L('x')]))).toContain(message);
  });

  it('rejects filledBy pointing at an auto atom or an in-line space separator', () => {
    const message = 'filledBy must point to an earlier literal or line-break separator atom';
    expect(issues(program([L('('), A(')', 0), A(']', 1)]))).toContain(message);
    expect(issues(program([L('a'), S(false), A(')', 1), L('b')]))).toContain(message);
  });

  it('rejects a required space separator with no literal after it', () => {
    expect(issues(program([L('('), S(true), A(')', 0)]))).toContain(
      'a required space separator must be followed by a literal',
    );
  });

  it('rejects an optional line-break separator', () => {
    expect(
      issues(program([L('a'), { kind: 'separator', canonical: '\n', required: false }, L('b')])),
    ).toContain('a line-break separator must be required');
  });

  it('rejects non-printable or non-ASCII text', () => {
    expect(TypingProgramSchema.safeParse(program([L('a\tb')])).success).toBe(false);
    expect(TypingProgramSchema.safeParse(program([L('café')])).success).toBe(false);
    expect(TypingProgramSchema.safeParse(program([L('')])).success).toBe(false);
  });
});
