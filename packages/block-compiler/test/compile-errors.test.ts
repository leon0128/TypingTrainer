import { describe, expect, it } from 'vitest';

import type { LanguageAdapter, Token } from '../src';
import { diagnosticsOf } from './helpers';

describe('TypeScript compile errors: one diagnostic each', () => {
  it.each([
    ['comment', 'const a = 1; // note\nconst b = 2;', '1:14'],
    ['comment', 'const a = /* x */ 1;', '1:11'],
    ['tab', 'function f() {\n\treturn 1;\n}', '2:1'],
    ['carriage-return', 'const a = 1;\r\nconst b = 2;', '1:13'],
    ['non-ascii', 'const s = "café";', '1:15'],
    ['leading-indentation', '  const a = 1;', '1:1'],
    ['blank-line', 'const a = 1;\n\nconst b = 2;', '2:1'],
    ['trailing-whitespace', 'const a = 1;  \nconst b = 2;', '1:13'],
    ['indentation-width', 'function f() {\n   return 1;\n}', '2:1'],
    ['indentation-width', 'function f() {\n return 1;\n}', '2:1'],
    // Invariant 6 (§3.3): the literal ` (x` would follow a separator across the auto `}`.
    ['space-literal-after-separator', 'const s = `${ user.id } (x)`;', '1:24'],
  ])('%s: %j', (code, source, at) => {
    expect(diagnosticsOf(source)).toEqual([{ code, at }]);
  });
});

describe('TypeScript compile errors: collection and staging', () => {
  it('collects every stage 2 diagnostic in one pass, sorted by position', () => {
    const source = 'function f() {\n\tconst a = 1; \n   return a;\n}';
    expect(diagnosticsOf(source)).toEqual([
      { code: 'tab', at: '2:1' },
      { code: 'trailing-whitespace', at: '2:14' },
      { code: 'indentation-width', at: '3:1' },
    ]);
  });

  it('stops at syntax errors without reporting later stages', () => {
    const diagnostics = diagnosticsOf('\tfoo(];');
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((d) => d.code === 'syntax')).toBe(true);
  });

  // unmatched-close, mismatched-close, and unclosed-open are unreachable through the TypeScript
  // adapter: the parser reports every unbalanced pair as a syntax error first, and compilation
  // stops at stage 1. These cases pin that down; the pairing checks themselves are covered with
  // a stub adapter below.
  it.each([
    ['an unmatched close', 'foo());'],
    ['a mismatched close', 'foo(];'],
    ['an unclosed open', 'foo(1;'],
    ['an unclosed template substitution', 'const s = `a${b`;'],
  ])('reports %s as a syntax error', (_, source) => {
    const diagnostics = diagnosticsOf(source);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((d) => d.code === 'syntax')).toBe(true);
  });
});

describe('compiler core pairing checks (stub adapter)', () => {
  const piece = (role: 'open' | 'close', pair: string, text: string) => ({ role, pair, text });
  const plain = (text: string, start: number): Token => ({
    kind: 0,
    text,
    start,
    end: start + text.length,
    pieces: [{ role: 'plain', text }],
  });
  const paired = (role: 'open' | 'close', pair: string, text: string, start: number): Token => ({
    kind: 0,
    text,
    start,
    end: start + text.length,
    pieces: [piece(role, pair, text)],
  });
  const stub = (tokens: Token[], required = false): LanguageAdapter => ({
    slug: 'stub',
    tokenize: () => tokens,
    separatorRule: () => ({ required }),
    pairRules: () => [
      { pair: 'paren', open: '(', close: ')' },
      { pair: 'bracket', open: '[', close: ']' },
    ],
    indentRule: () => ({ width: 2 }),
  });

  it('reports a close with no open', () => {
    const adapter = stub([plain('a', 0), paired('close', 'paren', ')', 1)]);
    expect(diagnosticsOf('a)', adapter)).toEqual([{ code: 'unmatched-close', at: '1:2' }]);
  });

  it('reports a close of the wrong kind', () => {
    const adapter = stub([paired('open', 'paren', '(', 0), paired('close', 'bracket', ']', 1)]);
    expect(diagnosticsOf('(]', adapter)).toEqual([{ code: 'mismatched-close', at: '1:2' }]);
  });

  it('reports an open that is never closed', () => {
    const adapter = stub([paired('open', 'paren', '(', 0), plain('a', 1)]);
    expect(diagnosticsOf('(a', adapter)).toEqual([{ code: 'unclosed-open', at: '1:1' }]);
  });

  it('fails safe with invalid-program when the output violates TypingProgramSchema', () => {
    // A required space followed only by an auto `)` passes the core checks but breaks
    // schema invariant 4.
    const adapter = stub(
      [paired('open', 'paren', '(', 0), plain('a', 1), paired('close', 'paren', ')', 3)],
      true,
    );
    expect(diagnosticsOf('(a )', adapter)).toEqual([{ code: 'invalid-program', at: '1:1' }]);
  });
});
