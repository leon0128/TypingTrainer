import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { classifySeparator, compileBlock } from '../src';
import { analyzeJavaSeparator, javaAdapter } from '../src/adapters/java';
import { scanJava } from '../src/adapters/java-scanner';
import { diagnosticsOf } from './helpers';

/** Written by scripts/java-reference with javac's tokenizer; see `pnpm java:golden`. */
interface Golden {
  generatedBy: string;
  googleJavaFormat: string;
  fixtures: {
    name: string;
    sha256: string;
    tokens: { text: string; start: number; end: number }[];
  }[];
  pairs: { prev: string; next: string; tokens: string[]; errors: number }[];
}

const fixturesDir = new URL('./fixtures/java/', import.meta.url);
const golden = JSON.parse(readFileSync(new URL('golden.json', fixturesDir), 'utf8')) as Golden;
const readJavaFixture = (name: string) => readFileSync(new URL(name, fixturesDir), 'utf8');

describe('Java scanner against javac golden data', () => {
  it('has golden data for exactly the Java fixtures on disk', () => {
    const onDisk = readdirSync(fixturesDir)
      .filter((name) => name.endsWith('.java'))
      .sort();
    expect(golden.fixtures.map((fixture) => fixture.name)).toEqual(onDisk);
  });

  describe.each(golden.fixtures.map((fixture) => [fixture.name, fixture] as const))(
    '%s',
    (name, fixture) => {
      const source = readJavaFixture(name);

      it('is unchanged since the golden data was generated (otherwise run pnpm java:golden)', () => {
        expect(createHash('sha256').update(source).digest('hex')).toBe(fixture.sha256);
      });

      it('scans to the same tokens and offsets as javac, without errors', () => {
        const { tokens, errors } = scanJava(source);
        expect(errors).toEqual([]);
        expect(tokens.map(({ text, start, end }) => ({ text, start, end }))).toEqual(
          fixture.tokens,
        );
      });
    },
  );

  it.each(golden.pairs.map((pair) => [pair.prev, pair.next, pair] as const))(
    're-lexes %j + %j like javac',
    (prev, next, pair) => {
      const analysis = analyzeJavaSeparator({ text: prev }, { text: next });
      const officialErrors = pair.errors > 0 ? ['javac error'] : [];
      expect(analysis.tokens).toEqual(pair.tokens);
      expect(analysis.scannerErrors.length > 0).toBe(pair.errors > 0);
      expect(analysis.reason).toBe(
        classifySeparator(prev, next, pair.tokens, officialErrors).reason,
      );
    },
  );

  it('never reaches the scanner-error branch for the golden pairs (see adapters/java.ts)', () => {
    const reasons = golden.pairs.map(
      (pair) => analyzeJavaSeparator({ text: pair.prev }, { text: pair.next }).reason,
    );
    expect(reasons).not.toContain('scanner-error');
    // `1in` is TypeScript's scanner-error example (TS1351); javac splits it without an error.
    expect(analyzeJavaSeparator({ text: '1' }, { text: 'in' })).toMatchObject({
      reason: 'separable',
      scannerErrors: [],
    });
  });
});

describe('Java Unicode escapes', () => {
  it('rejects a Unicode escape in code or in a string literal', () => {
    expect(diagnosticsOf('int \\u0061 = 1;', javaAdapter)).toEqual([
      { code: 'unicode-escape', at: '1:5' },
    ]);
    expect(diagnosticsOf('String s = "\\u0041";', javaAdapter)).toEqual([
      { code: 'unicode-escape', at: '1:13' },
    ]);
  });

  it('accepts an escaped backslash followed by u, which is not a Unicode escape', () => {
    const program = compileBlock('String s = "\\\\u0041";', javaAdapter, 'escaped-backslash');
    expect(program.atoms.map((atom) => ('text' in atom ? atom.text : atom.kind))).toContain(
      '\\\\u0041',
    );
  });

  it('is checked on the raw source before the scanner runs, so scanner errors are not reported', () => {
    // Besides the escape, this source has an unclosed string and a hex literal without digits.
    // Only unicode-escape comes back: the scanner never sees the source.
    expect(diagnosticsOf('int x = 0x; String s = "\\u0041', javaAdapter)).toEqual([
      { code: 'unicode-escape', at: '1:25' },
    ]);
  });
});

describe('Java compile errors', () => {
  it.each([
    // Text blocks always span lines and are rejected by the compiler core (§5.1).
    ['multiline-token', 'String s = """\n  hi\n  """;', '1:12'],
    ['syntax', 'String s = "abc;', '1:12'],
    ['syntax', "char c = 'a;", '1:10'],
    ['syntax', 'int x = 0x;', '1:9'],
    ['comment', 'int x = 1; // note', '1:12'],
    ['multiple-spaces', 'int  x = 1;', '1:4'],
    ['indentation-width', 'void f() {\n   return;\n}', '2:1'],
    // Without a parser, the core pairing checks are reachable for Java.
    ['unmatched-close', 'f(1));', '1:5'],
    ['mismatched-close', 'f(1];', '1:4'],
    ['unclosed-open', 'f(1;', '1:2'],
  ])('%s: %j', (code, source, at) => {
    expect(diagnosticsOf(source, javaAdapter)).toEqual([{ code, at }]);
  });

  it('reports a one-line """ as syntax errors, like javac', () => {
    const diagnostics = diagnosticsOf('String s = """hi""";', javaAdapter);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((d) => d.code === 'syntax')).toBe(true);
  });
});
