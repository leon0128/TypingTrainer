import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { classifySeparator } from '../src';
import {
  analyzePythonSeparator,
  lexicalErrors,
  pythonAdapter,
  relexPython,
  type PythonRelex,
} from '../src/adapters/python';
import { PythonTokenKind, scanPython } from '../src/adapters/python-scanner';
import { diagnosticsOf } from './helpers';

interface RelexGolden {
  text: string;
  tokens: string[];
  tokenizeError: string | null;
  lexical: string[];
  bracket: string[];
}

/** Written by scripts/python-reference with CPython 3.12; see `pnpm python:golden`. */
interface Golden {
  generatedBy: string;
  black: string;
  fixtures: {
    name: string;
    sha256: string;
    tokens: { text: string; start: number; end: number }[];
  }[];
  pairs: {
    prev: string;
    next: string;
    raw: RelexGolden;
    corrected: { text: string; tokens: string[]; lexical: string[] };
    corrections: string[];
    reason: string;
  }[];
  fragments: RelexGolden[];
}

const fixturesDir = new URL('./fixtures/python/', import.meta.url);
const golden = JSON.parse(readFileSync(new URL('golden.json', fixturesDir), 'utf8')) as Golden;
const readPythonFixture = (name: string) => readFileSync(new URL(name, fixturesDir), 'utf8');

const FSTRING_START = /^(?:[rR]?[fF]|[fF][rR])("""|'''|"|')$/;
const token = (text: string) => ({
  text,
  kind: FSTRING_START.test(text) ? PythonTokenKind.FStringStart : PythonTokenKind.Name,
});
const has = (relex: PythonRelex, category: 'bracket' | 'lexical') =>
  relex.errors.some((error) => error.category === category);

describe('Python scanner against CPython 3.12 golden data', () => {
  it('has golden data for exactly the Python fixtures on disk', () => {
    const onDisk = readdirSync(fixturesDir)
      .filter((name) => name.endsWith('.py'))
      .sort();
    expect(golden.fixtures.map((fixture) => fixture.name)).toEqual(onDisk);
  });

  describe.each(golden.fixtures.map((fixture) => [fixture.name, fixture] as const))(
    '%s',
    (name, fixture) => {
      const source = readPythonFixture(name);

      it('is unchanged since the golden data was generated (otherwise run pnpm python:golden)', () => {
        expect(createHash('sha256').update(source).digest('hex')).toBe(fixture.sha256);
      });

      it('scans to the same tokens and offsets as CPython, without errors', () => {
        const { tokens, errors } = scanPython(source);
        expect(errors).toEqual([]);
        expect(tokens.map(({ text, start, end }) => ({ text, start, end }))).toEqual(
          fixture.tokens,
        );
      });
    },
  );

  it.each(golden.pairs.map((pair) => [pair.prev, pair.next, pair] as const))(
    're-lexes %j + %j like CPython, raw and corrected',
    (prev, next, pair) => {
      const analysis = analyzePythonSeparator(token(prev), token(next));

      // Raw re-lex, before any correction. CPython's tokenize stops at a TokenError, so tokens
      // are only comparable when it did not raise.
      if (pair.raw.tokenizeError === null) expect(analysis.raw.tokens).toEqual(pair.raw.tokens);
      expect(has(analysis.raw, 'lexical')).toBe(pair.raw.lexical.length > 0);
      expect(has(analysis.raw, 'bracket')).toBe(pair.raw.bracket.length > 0);

      // Corrected re-lex and the decision based on it.
      expect(analysis.corrected.text).toBe(pair.corrected.text);
      expect(analysis.corrected.tokens).toEqual(pair.corrected.tokens);
      expect(analysis.corrected.errors.length > 0).toBe(pair.corrected.lexical.length > 0);
      expect(analysis.corrections).toEqual(pair.corrections);
      expect(analysis.reason).toBe(pair.reason);
    },
  );

  it.each(golden.fragments.map((fragment) => [fragment.text, fragment] as const))(
    'reports the same error categories as CPython for the fragment %j',
    (text, fragment) => {
      const relex = relexPython(text);
      expect(has(relex, 'lexical')).toBe(fragment.lexical.length > 0);
      expect(has(relex, 'bracket')).toBe(fragment.bracket.length > 0);
    },
  );
});

describe('separator corrections', () => {
  it('ignores bracket errors without swallowing a lexical error in the same fragment', () => {
    // No pair of two valid tokens produces both kinds of error (a search of 288 candidate pairs
    // with CPython 3.12 found none), so the correction is exercised on a fragment directly.
    const relex = relexPython('1or)');
    expect(relex.errors.map((error) => error.category).sort()).toEqual(['bracket', 'lexical']);
    expect(golden.fragments.find((fragment) => fragment.text === '1or)')).toMatchObject({
      bracket: [expect.stringContaining("unmatched ')'")],
      lexical: [expect.stringContaining('invalid decimal literal')],
    });

    const kept = lexicalErrors(relex);
    expect(kept.map((error) => error.code)).toEqual(['number-keyword']);
    // The kept error still decides the `1` / `or` boundary as a scanner error.
    expect(
      classifySeparator(
        '1',
        'or',
        relex.tokens.slice(0, 2),
        kept.map((error) => error.code),
      ).reason,
    ).toBe('scanner-error');
  });

  it('completes a triple-quoted f-string start with three closing quotes', () => {
    const optional = analyzePythonSeparator(token('='), token('f"""'));
    expect(optional).toMatchObject({
      reason: 'separable',
      corrections: ['complete-fstring-start'],
      corrected: { text: '=f""""""', tokens: ['=', 'f"""', '"""'] },
    });
    // Raw, the start alone is an unterminated triple-quoted f-string.
    expect(has(optional.raw, 'lexical')).toBe(true);

    const required = analyzePythonSeparator(token('return'), token('f"""'));
    expect(required).toMatchObject({
      reason: 'token-mismatch',
      corrections: ['complete-fstring-start'],
      corrected: { text: 'returnf""""""', tokens: ['returnf', '""""""'] },
    });

    const both = analyzePythonSeparator(token('('), token("f'''"));
    expect(both).toMatchObject({
      reason: 'separable',
      corrections: ['complete-fstring-start', 'ignore-bracket-balance'],
      corrected: { text: "(f''''''" },
    });
  });

  it('decides `1 if` as a scanner error: Python does have that branch', () => {
    expect(analyzePythonSeparator(token('1'), token('if'))).toMatchObject({
      reason: 'scanner-error',
      tokens: ['1', 'if'],
      corrections: [],
    });
  });
});

describe('Python compile errors', () => {
  it.each([
    ['unindent that matches no outer level', 'if x:\n        a = 1\n    b = 2'],
    ['unexpected indent', 'x = 1\n    y = 2'],
    ['missing indented block', 'if x:\ny = 2'],
    // Bracket errors are syntax errors from the scanner, so the core pairing checks are not
    // reached through this adapter (like TypeScript).
    ['an unmatched close', 'x = f(1))'],
    ['a mismatched close', 'x = f(1]'],
    ['an unclosed open', 'x = f(1'],
    ['an unterminated string', 'x = "abc'],
    ['a keyword directly after a number', 'x = 1if y else 2'],
    ['a t-string', 'x = t"a{b}"'],
  ])('reports %s as a syntax error', (_, source) => {
    const diagnostics = diagnosticsOf(source, pythonAdapter);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((d) => d.code === 'syntax')).toBe(true);
  });

  it('rejects f-string brace escapes with their own code', () => {
    expect(diagnosticsOf('x = f"{{a}}"', pythonAdapter)).toEqual([
      { code: 'fstring-brace-escape', at: '1:7' },
      { code: 'fstring-brace-escape', at: '1:10' },
    ]);
  });

  it.each([
    ['comment', 'x = 1 # note', '1:7'],
    ['line-continuation', 'x = 1 + \\\n    2', '1:9'],
    ['multiline-token', 'x = """a\nb"""', '1:5'],
    ['space-literal-after-separator', 'x = f"{ a } b"', '1:12'],
    ['tab', 'if x:\n\ty = 1', '2:1'],
    ['indentation-width', 'if x:\n  y = 1', '2:1'],
  ])('%s: %j', (code, source, at) => {
    expect(diagnosticsOf(source, pythonAdapter)).toEqual([{ code, at }]);
  });
});
