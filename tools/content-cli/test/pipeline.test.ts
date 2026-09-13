import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ContentBundleSchema } from '@typing-trainer/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import {
  LANGUAGES,
  bundleDiagnostics,
  jaccard,
  runPipeline,
  shingles,
  writeBundles,
  type ContentDiagnostic,
} from '../src';

const roots: string[] = [];

/** Creates a temporary repository root with the given files under `content/blocks/`. */
function repository(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'content-cli-'));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    const full = join(root, 'content', 'blocks', path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const codes = (diagnostics: readonly ContentDiagnostic[]) =>
  diagnostics.map((d) => `${d.file.slice(d.file.lastIndexOf('/') + 1)} ${d.stage}/${d.code}`);

const SUM_ALL = [
  'function sumAll(values: number[]): number {',
  '  let total = 0;',
  '  for (const value of values) {',
  '    total += value;',
  '  }',
  '  return total;',
  '}',
  '',
].join('\n');

const GO_ADD = [
  'func add(a, b int) int {',
  '\tsum := a + b',
  '\tsum++',
  '\treturn sum',
  '}',
  '',
].join('\n');

describe('content pipeline', () => {
  it('builds a deterministic bundle for valid blocks', async () => {
    const root = repository({ 'typescript/sum-all.ts': SUM_ALL, 'go/add.go': GO_ADD });
    const result = await runPipeline({ root });
    expect(result.diagnostics).toEqual([]);

    const typescript = result.bundles.get('typescript');
    expect(typescript?.bundle.blocks.map((block) => block.blockId)).toEqual(['typescript/sum-all']);
    expect(ContentBundleSchema.safeParse(JSON.parse(typescript?.text ?? '')).success).toBe(true);
    expect((await runPipeline({ root })).bundles.get('typescript')?.text).toBe(typescript?.text);
    expect(result.bundles.get('go')?.bundle.blocks[0]?.blockId).toBe('go/add');
    expect(result.bundles.has('java')).toBe(false);
  });

  it('checks committed bundles for missing, stale, and unexpected files', async () => {
    const root = repository({ 'typescript/sum-all.ts': SUM_ALL });
    const result = await runPipeline({ root });
    expect(codes(bundleDiagnostics(root, result))).toEqual([
      'typescript.bundle.json bundle/missing',
    ]);

    writeBundles(root, result);
    expect(bundleDiagnostics(root, result)).toEqual([]);

    const path = join(root, 'content/dist/typescript.bundle.json');
    writeFileSync(path, readFileSync(path, 'utf8').replace('"total"', '"sum"'));
    writeFileSync(join(root, 'content/dist/java.bundle.json'), '{}\n');
    expect(codes(bundleDiagnostics(root, result))).toEqual([
      'typescript.bundle.json bundle/stale',
      'java.bundle.json bundle/unexpected',
    ]);
  });

  it('rejects badly named files', async () => {
    const root = repository({ 'typescript/Sum_All.ts': SUM_ALL, 'typescript/notes.md': SUM_ALL });
    expect(codes((await runPipeline({ root })).diagnostics)).toEqual([
      'Sum_All.ts discover/file-name',
      'notes.md discover/file-name',
    ]);
  });

  it('requires TypeScript blocks to be Prettier default output', async () => {
    const root = repository({
      'typescript/sum-all.ts': SUM_ALL.replace('let total = 0;', 'let total = 0'),
    });
    expect(codes((await runPipeline({ root })).diagnostics)).toEqual([
      'sum-all.ts format/not-formatted',
    ]);
  });

  it('enforces line counts, block shapes, and standard-library-only imports', async () => {
    const root = repository({
      'typescript/short.ts': 'const a = 1;\n',
      'go/two.go': `${GO_ADD}func sub(a, b int) int {\n\treturn a - b\n}\n`,
      'python/two-methods.py': [
        'class Pair:',
        '    def first(self):',
        '        return 1',
        '    def second(self):',
        '        return 2',
        '',
      ].join('\n'),
      'python/fetch.py': [
        'def fetch(url):',
        '    import requests',
        '    response = requests.get(url)',
        '    data = response.json()',
        '    return data',
        '',
      ].join('\n'),
      'python/paths.py': [
        'def stems(names):',
        '    import os.path',
        '    result = []',
        '    for name in names:',
        '        result.append(os.path.splitext(name)[0])',
        '    return result',
        '',
      ].join('\n'),
    });
    expect(codes((await runPipeline({ root })).diagnostics)).toEqual([
      'short.ts constraints/line-count',
      'two.go constraints/block-shape',
      'fetch.py constraints/import',
      'two-methods.py constraints/block-shape',
    ]);
  });

  it('rejects exact and near-duplicate blocks within a language', async () => {
    const renamed = SUM_ALL.replace('sumAll', 'addUp')
      .replace('values', 'items')
      .replace('values', 'items')
      .replaceAll('total', 'acc')
      .replaceAll('value', 'item');
    const root = repository({
      'typescript/a-sum.ts': SUM_ALL,
      'typescript/b-renamed.ts': renamed,
      'typescript/c-copy.ts': SUM_ALL,
    });
    expect(codes((await runPipeline({ root })).diagnostics)).toEqual([
      'b-renamed.ts dedupe/similar',
      'c-copy.ts dedupe/duplicate',
    ]);
  });
});

describe('tree-sitter screening and its known gaps', () => {
  it('wrongly rejects the valid Java literal 1__0 (known false positive, see src/tree-sitter.ts)', async () => {
    // JLS §3.10.1 allows runs of underscores between digits and javac accepts this block, but
    // tree-sitter-java 0.23.5 reports an ERROR node. Such blocks are rewritten, not exempted.
    const root = repository({
      'java/underscores.java': [
        'static int underscores() {',
        '  int value = 1__0;',
        '  value += 2;',
        '  value *= 3;',
        '  return value;',
        '}',
        '',
      ].join('\n'),
    });
    const { diagnostics } = await runPipeline({ root });
    expect(codes(diagnostics)).toEqual(['underscores.java tree-sitter/error-node']);
  });

  it('misses a Java multi-character char literal, which the compile stage still rejects', async () => {
    const root = repository({
      'java/chars.java': [
        'static char first() {',
        "  char value = 'ab';",
        '  value += 1;',
        '  value -= 1;',
        '  return value;',
        '}',
        '',
      ].join('\n'),
    });
    const stages = (await runPipeline({ root })).diagnostics.map((d) => d.stage);
    expect(stages).not.toContain('tree-sitter');
    expect(stages).toContain('compile');
  });

  it('misses a TypeScript leading-zero literal, which the TypeScript syntax check rejects', async () => {
    const root = repository({
      'typescript/octal.ts': [
        'function octal() {',
        '  const value = 08;',
        '  const next = value + 1;',
        '  const last = next * 2;',
        '  return last;',
        '}',
        '',
      ].join('\n'),
    });
    const diagnostics = (await runPipeline({ root })).diagnostics;
    expect(diagnostics.map((d) => d.stage)).not.toContain('tree-sitter');
    const syntax = diagnostics.find((d) => d.stage === 'toolchain');
    expect(syntax?.line).toBe(2);
    expect(syntax?.message).toContain('leading zeros');
  });
});

describe('similarity', () => {
  it('scores renamed copies as identical and unrelated blocks low', () => {
    const config = LANGUAGES.typescript;
    const tokens = (source: string) => config.adapter.tokenize(source);
    const other = 'function greet(name: string): string {\n  return `hello ${name}`;\n}\n';
    expect(
      jaccard(
        shingles(config, tokens(SUM_ALL)),
        shingles(config, tokens(SUM_ALL.replaceAll('total', 'acc'))),
      ),
    ).toBe(1);
    expect(
      jaccard(shingles(config, tokens(SUM_ALL)), shingles(config, tokens(other))),
    ).toBeLessThan(0.1);
  });
});
