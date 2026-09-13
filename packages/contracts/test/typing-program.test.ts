import { describe, expect, it } from 'vitest';

import { TypingProgramSchema, countCanonicalKeystrokes, type Atom } from '../src';

const L = (text: string): Atom => ({ kind: 'literal', text });
const A = (text: string, filledBy: number): Atom => ({ kind: 'auto', text, filledBy });
const P = (text: string): Atom => ({ kind: 'padding', text });
const S = (required: boolean): Atom => ({ kind: 'separator', canonical: ' ', required });
const NL: Atom = { kind: 'separator', canonical: '\n', required: true };

function program(atoms: Atom[], canonicalKeystrokes = countCanonicalKeystrokes(atoms)) {
  return { blockId: 'test', atoms, canonicalKeystrokes };
}

function issues(input: unknown): string[] {
  const result = TypingProgramSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

const CLOSER = 'a closing auto atom must be filled by an earlier literal';
const INDENTATION = 'indentation must be filled by the line-break separator immediately before it';
const PADDING =
  'padding must directly follow a literal or a non-blank auto atom and directly precede a space separator';

describe('countCanonicalKeystrokes', () => {
  it('counts literal characters and separators, but not auto or padding text', () => {
    // `f(x) {` + newline + indent + `y:  z` + newline + `}`
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
      L(':'),
      P(' '),
      S(false),
      L('z'),
      NL,
      A('}', 5),
    ];
    const literalChars = 'f(x{y:z'.length;
    const separators = 4;
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
    expect(issues(program([P(' '), S(false), L('x')]))).toContain(
      'the first typed atom must be a literal',
    );
  });

  it('rejects a required space separator with no literal after it', () => {
    expect(issues(program([L('('), S(true), A(')', 0)]))).toContain(
      'a required space separator must be followed by a literal',
    );
  });

  it('rejects a literal starting with a space right after a separator', () => {
    const message = 'a literal following a separator must not start with a space';
    expect(issues(program([L('a'), S(false), L(' b')]))).toContain(message);
    expect(issues(program([L('('), S(false), A(')', 0), L(' b')]))).toContain(message);
    // A space inside a string token is fine: the literal follows the opening quote.
    expect(issues(program([L('"'), L(' b'), A('"', 0)]))).toEqual([]);
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

describe('TypingProgramSchema: closing auto atoms (invariant 2)', () => {
  it('rejects filledBy pointing forward, at itself, or out of range', () => {
    expect(issues(program([L('('), A(')', 1)]))).toContain(CLOSER);
    expect(issues(program([L('('), A(')', 2), L('x')]))).toContain(CLOSER);
    expect(issues(program([L('x'), A(')', 5)]))).toContain(CLOSER);
  });

  it('rejects filledBy pointing at an auto atom or any separator', () => {
    expect(issues(program([L('('), A(')', 0), A(']', 1)]))).toContain(CLOSER);
    expect(issues(program([L('a'), S(false), A(')', 1), L('b')]))).toContain(CLOSER);
    expect(issues(program([L('a'), NL, A(')', 1), L('b')]))).toContain(CLOSER);
  });
});

describe('TypingProgramSchema: indentation (invariant 2)', () => {
  it('accepts indentation filled by the line break immediately before it', () => {
    expect(issues(program([L('{'), NL, A('  ', 1), L('x'), NL, A('}', 0)]))).toEqual([]);
  });

  it('rejects indentation filled by a literal', () => {
    expect(issues(program([L('a'), A('  ', 0), S(false), L('b')]))).toContain(INDENTATION);
  });

  it('rejects indentation filled by an earlier line break that is not directly before it', () => {
    expect(issues(program([L('a'), NL, L('b'), A('  ', 1), S(false), L('c')]))).toContain(
      INDENTATION,
    );
  });
});

describe('TypingProgramSchema: padding (invariant 7)', () => {
  it('accepts padding after a literal or a closing auto atom, before a space separator', () => {
    // "width":  80,
    expect(
      issues(program([L('"'), L('width'), A('"', 0), L(':'), P(' '), S(false), L('80'), L(',')])),
    ).toEqual([]);
    // {1}   + x
    expect(issues(program([L('{'), L('1'), A('}', 0), P('  '), S(false), L('+')]))).toEqual([]);
  });

  it('rejects padding that does not follow a token', () => {
    expect(issues(program([P(' '), S(false), L('a')]))).toContain(PADDING);
    expect(issues(program([L('a'), S(false), P(' '), S(false), L('b')]))).toContain(PADDING);
    expect(issues(program([L('{'), NL, A('  ', 1), P(' '), S(false), L('x')]))).toContain(PADDING);
  });

  it('rejects padding that does not precede a space separator', () => {
    expect(issues(program([L('a'), P(' '), L('b')]))).toContain(PADDING);
    expect(issues(program([L('a'), P(' ')]))).toContain(PADDING);
    expect(issues(program([L('a'), P(' '), NL, L('b')]))).toContain(PADDING);
  });

  it('rejects padding text other than spaces', () => {
    expect(
      TypingProgramSchema.safeParse(program([L('a'), P('\t'), S(false), L('b')])).success,
    ).toBe(false);
    expect(TypingProgramSchema.safeParse(program([L('a'), P(''), S(false), L('b')])).success).toBe(
      false,
    );
  });
});
