import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { classifySeparator } from '../src';
import { analyzeGoSeparator, goAdapter } from '../src/adapters/go';
import { scanGo } from '../src/adapters/go-scanner';
import { diagnosticsOf } from './helpers';

/** Written by scripts/go-reference with the official go/scanner; see `pnpm go:golden`. */
interface Golden {
  generatedBy: string;
  fixtures: {
    name: string;
    sha256: string;
    tokens: { text: string; start: number; end: number }[];
  }[];
  pairs: { prev: string; next: string; tokens: string[]; errors: number }[];
}

const fixturesDir = new URL('./fixtures/go/', import.meta.url);
const golden = JSON.parse(readFileSync(new URL('golden.json', fixturesDir), 'utf8')) as Golden;
const readGoFixture = (name: string) => readFileSync(new URL(name, fixturesDir), 'utf8');

describe('Go scanner against go/scanner golden data', () => {
  it('has golden data for exactly the Go fixtures on disk', () => {
    const onDisk = readdirSync(fixturesDir)
      .filter((name) => name.endsWith('.go'))
      .sort();
    expect(golden.fixtures.map((fixture) => fixture.name)).toEqual(onDisk);
  });

  describe.each(golden.fixtures.map((fixture) => [fixture.name, fixture] as const))(
    '%s',
    (name, fixture) => {
      const source = readGoFixture(name);

      it('is unchanged since the golden data was generated (otherwise run pnpm go:golden)', () => {
        expect(createHash('sha256').update(source).digest('hex')).toBe(fixture.sha256);
      });

      it('scans to the same tokens and offsets as go/scanner, without errors', () => {
        const { tokens, errors } = scanGo(source);
        expect(errors).toEqual([]);
        expect(tokens.map(({ text, start, end }) => ({ text, start, end }))).toEqual(
          fixture.tokens,
        );
      });
    },
  );

  it.each(golden.pairs.map((pair) => [pair.prev, pair.next, pair] as const))(
    're-lexes %j + %j like go/scanner',
    (prev, next, pair) => {
      const analysis = analyzeGoSeparator({ text: prev }, { text: next });
      const officialErrors = pair.errors > 0 ? ['go/scanner error'] : [];
      expect(analysis.tokens).toEqual(pair.tokens);
      expect(analysis.scannerErrors.length > 0).toBe(pair.errors > 0);
      expect(analysis.reason).toBe(
        classifySeparator(prev, next, pair.tokens, officialErrors).reason,
      );
    },
  );
});

describe('Go compile errors', () => {
  it.each([
    // Go inserts a semicolon after `)` at the line break, so the brace cannot start a line.
    ['syntax', 'func f()\n{\n}', '2:1'],
    ['syntax', 's := "abc', '1:6'],
    ['syntax', "r := 'a", '1:6'],
    ['syntax', 'x := a # b', '1:8'],
    ['multiline-token', 'x := `a\nb`', '1:6'],
    ['comment', 'x := 1 // note', '1:8'],
    // Not normalized: compileBlock itself never accepts tabs.
    ['tab', 'func f() {\n\treturn\n}', '2:1'],
    ['indentation-width', 'func f() {\n  return\n}', '2:1'],
    // Without a parser, the core pairing checks are reachable for Go.
    ['unmatched-close', 'x := f(1))', '1:10'],
    ['mismatched-close', 'x := f(1]', '1:9'],
    ['unclosed-open', 'x := f(1', '1:7'],
  ])('%s: %j', (code, source, at) => {
    expect(diagnosticsOf(source, goAdapter)).toEqual([{ code, at }]);
  });
});
