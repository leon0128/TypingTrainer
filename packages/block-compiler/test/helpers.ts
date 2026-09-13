import { readFileSync } from 'node:fs';

import type { Atom } from '@typing-trainer/contracts';

import { CompileError, compileBlock, typescriptAdapter, type LanguageAdapter } from '../src';

export const L = (text: string): Atom => ({ kind: 'literal', text });
export const A = (text: string, filledBy: number): Atom => ({ kind: 'auto', text, filledBy });
/** Optional in-line space. */
export const S: Atom = { kind: 'separator', canonical: ' ', required: false };
/** Required in-line space. */
export const R: Atom = { kind: 'separator', canonical: ' ', required: true };
export const NL: Atom = { kind: 'separator', canonical: '\n', required: true };

export function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

/** The canonical code a program displays (§3.2): every atom's text, separators included. */
export function render(atoms: readonly Atom[]): string {
  return atoms.map((atom) => (atom.kind === 'separator' ? atom.canonical : atom.text)).join('');
}

/** Compiles `source` and returns its diagnostics as compact `{ code, at: "line:column" }`. */
export function diagnosticsOf(source: string, adapter: LanguageAdapter = typescriptAdapter) {
  try {
    compileBlock(source, adapter, 'test');
  } catch (error) {
    if (!(error instanceof CompileError)) throw error;
    return error.diagnostics.map((d) => ({
      code: d.code,
      at: `${String(d.start.line)}:${String(d.start.column)}`,
    }));
  }
  throw new Error('expected a CompileError');
}
