import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { typescriptAdapter } from '../src';
import { analyzeSeparator, readParseDiagnostics } from '../src/adapters/typescript';
import { readFixture } from './helpers';

/** A standalone token as the scanner sees it; enough for tokens outside template contexts. */
function token(text: string) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
  return { text, kind: scanner.scan() };
}

describe('analyzeSeparator: optional (separable) cases', () => {
  it.each([
    ['10n', '*'],
    ['*', 'factor'],
    ['0xff', '+'],
    ['+', '1_000'],
    ['1_000', '-'],
    ['-', '.5'],
    ['=', '10n'],
    ['big', '='],
    ['{', '1'],
    ['===', '"string"'],
    ['--', '>'],
    // TypeScript has no `->` token, so this is optional here even though §3.3.1's
    // language-neutral table lists `->` as fusing (it does in Java).
    ['-', '>'],
  ])('%j %j is separable, with no scanner error', (a, b) => {
    const analysis = analyzeSeparator(token(a), token(b));
    // Optional only because re-lexing gave exactly [A, B] AND the scanner stayed silent.
    expect(analysis.tokens).toEqual([a, b]);
    expect(analysis.scannerErrors).toEqual([]);
    expect(analysis).toMatchObject({ reason: 'separable', required: false });
  });
});

describe('analyzeSeparator: required cases', () => {
  it('`1` `in` is required via scanner-error', () => {
    // Path: scanner-error. The scanner does split `1in` into ["1", "in"], so the token check
    // alone would call this optional. It reports TS1351 ("An identifier or keyword cannot
    // immediately follow a numeric literal"), and that error is what makes it required.
    const analysis = analyzeSeparator(token('1'), token('in'));
    expect(analysis.tokens).toEqual(['1', 'in']);
    expect(analysis.scannerErrors).toEqual([1351]);
    expect(analysis).toMatchObject({ reason: 'scanner-error', required: true });
  });

  it.each([
    // Path: token-mismatch for all of these. Re-lexing yields a single token, so the token
    // count is not 2; no scanner error is involved.
    ['10', 'n', ['10n']], //         BigInt literal
    ['1_000', 'n', ['1_000n']], //   BigInt literal with numeric separators
    ['1', '.', ['1.']], //           decimal point
    ['1', '.5', ['1.5']], //         decimal number
    ['+', '+', ['++']],
    ['<', '<', ['<<']],
    ['-', '-', ['--']],
    ['=', '>', ['=>']],
    ['>', '=', ['>=']], //           only after reScanGreaterToken (conservative)
    ['?', '.', ['?.']],
    ['const', 'x', ['constx']],
    ['in', 'table', ['intable']],
  ])('%j %j is required via token-mismatch', (a, b, relexed) => {
    const analysis = analyzeSeparator(token(a), token(b));
    expect(analysis.tokens).toEqual(relexed);
    expect(analysis.scannerErrors).toEqual([]);
    expect(analysis).toMatchObject({ reason: 'token-mismatch', required: true });
  });

  it('re-lexes template continuations and regular expressions in context', () => {
    const tokens = typescriptAdapter.tokenize('const s = `a${ x }b` + /re/;');
    const byText = (text: string) => {
      const found = tokens.find((t) => t.text === text);
      if (!found) throw new Error(`token ${text} not found`);
      return found;
    };
    // `x` + `}b\`` needs reScanTemplateToken; `=` + `/re/` would not reach the regex without it.
    expect(analyzeSeparator(byText('x'), byText('}b`'))).toMatchObject({ reason: 'separable' });
    expect(analyzeSeparator(byText('`a${'), byText('x'))).toMatchObject({ reason: 'separable' });
    expect(analyzeSeparator(byText('+'), byText('/re/'))).toMatchObject({ reason: 'separable' });
  });
});

describe('numbers.ts separators', () => {
  it('records why each in-line separator is optional or required', () => {
    const source = readFixture('numbers.ts');
    const tokens = typescriptAdapter.tokenize(source);
    const reasons: string[] = [];
    for (let i = 1; i < tokens.length; i += 1) {
      const prev = tokens[i - 1];
      const next = tokens[i];
      if (!prev || !next) continue;
      const gap = source.slice(prev.end, next.start);
      if (gap === '' || gap.includes('\n')) continue;
      const { reason, scannerErrors } = analyzeSeparator(prev, next);
      const errors = scannerErrors.length > 0 ? ` [${scannerErrors.join(',')}]` : '';
      reasons.push(`${prev.text} ${next.text}: ${reason}${errors}`);
    }

    expect(reasons).toEqual([
      'const big: token-mismatch',
      'big =: separable',
      '= 10n: separable',
      '10n *: separable',
      '* factor: separable',
      'const has: token-mismatch',
      'has =: separable',
      '= 1: separable',
      '1 in: scanner-error [1351]',
      'in table: token-mismatch',
      'const fixed: token-mismatch',
      'fixed =: separable',
      '= 1: separable',
      '1 .: token-mismatch',
      'const mask: token-mismatch',
      'mask =: separable',
      '= 0xff: separable',
      '0xff +: separable',
      '+ 1_000: separable',
      '1_000 -: separable',
      '- .5: separable',
    ]);
  });
});

describe('tokenize', () => {
  it('splits template literal tokens into paired pieces', () => {
    const [head, , tail] = typescriptAdapter.tokenize('`a${b}c`');
    expect(head?.pieces).toEqual([
      { role: 'open', pair: 'backtick', text: '`' },
      { role: 'plain', text: 'a' },
      { role: 'open', pair: 'substitution', text: '${' },
    ]);
    expect(tail?.pieces).toEqual([
      { role: 'close', pair: 'substitution', text: '}' },
      { role: 'plain', text: 'c' },
      { role: 'close', pair: 'backtick', text: '`' },
    ]);
  });
});

describe('TypeScript internals', () => {
  it('runs on TypeScript 6.x, which readParseDiagnostics relies on', () => {
    expect(ts.version.split('.')[0]).toBe('6');
  });

  it('reads parse diagnostics of the expected shape', () => {
    const sourceFile = { parseDiagnostics: [{ start: 2, length: 3, messageText: 'boom' }] };
    expect(readParseDiagnostics(sourceFile)).toEqual([{ start: 2, end: 5, message: 'boom' }]);
  });

  it('fails loudly when parseDiagnostics is missing', () => {
    expect(() => readParseDiagnostics({})).toThrow(
      /SourceFile\.parseDiagnostics is undefined, expected an array\. block-compiler relies on TypeScript 6\.x/,
    );
  });

  it('fails loudly when a parse diagnostic has an unexpected shape', () => {
    expect(() => readParseDiagnostics({ parseDiagnostics: [{ start: '1' }] })).toThrow(
      /parseDiagnostics\[0\] lacks numeric start\/length or messageText/,
    );
  });
});
