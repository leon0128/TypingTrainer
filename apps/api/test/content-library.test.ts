import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CODE_LANGUAGES, type ContentBundle } from '@typing-trainer/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { ContentLoadError, loadContentLibrary } from '../src/modules/content/content-library';
import { TEST_CONTENT_DIR } from './support/env';

const directories: string[] = [];

/** A temporary content directory with the given files. */
function contentDirectory(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), 'content-library-'));
  directories.push(directory);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(directory, name), text);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const bundleText = (language: string) =>
  readFileSync(join(TEST_CONTENT_DIR, `${language}.bundle.json`), 'utf8');
const bundle = (language: string) => JSON.parse(bundleText(language)) as ContentBundle;

async function problemsOf(directory: string): Promise<readonly string[]> {
  try {
    await loadContentLibrary(directory);
  } catch (error) {
    if (error instanceof ContentLoadError) return error.problems;
    throw error;
  }
  return [];
}

describe('loadContentLibrary', () => {
  it('loads the committed bundles of every content language', async () => {
    const library = await loadContentLibrary(TEST_CONTENT_DIR);
    expect(library.languages).toEqual([...CODE_LANGUAGES].sort());
    for (const language of CODE_LANGUAGES) {
      const loaded = library.get(language);
      const committed = bundle(language);
      expect(loaded?.revision).toBe(committed.revision);
      expect(loaded?.blockIds).toEqual(committed.blocks.map((block) => block.blockId));
      const first = committed.blocks[0];
      expect(first && loaded?.programs.get(first.blockId)).toEqual(first);
    }
    expect(library.has('rust')).toBe(false);
  });

  it('ignores files that are not bundles', async () => {
    const directory = contentDirectory({
      'go.bundle.json': bundleText('go'),
      'toolchains.json': '{"go": "go1.26"}',
      'README.md': '# not content',
    });
    expect((await loadContentLibrary(directory)).languages).toEqual(['go']);
  });

  it('refuses a bundle whose blocks do not match its revision', async () => {
    // Same length, so the bundle still matches the schema and only the revision gives it away.
    const tampered = bundle('go');
    const atom = tampered.blocks[0]?.atoms[0];
    if (atom?.kind !== 'literal') throw new Error('expected the first atom to be a literal');
    atom.text = `${atom.text.slice(0, -1)}${atom.text.endsWith('x') ? 'y' : 'x'}`;
    const problems = await problemsOf(
      contentDirectory({ 'go.bundle.json': JSON.stringify(tampered) }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /^go\.bundle\.json: revision [0-9a-f]{64} does not match its blocks/,
    );
  });

  it('refuses a bundle filed under another language', async () => {
    const problems = await problemsOf(contentDirectory({ 'python.bundle.json': bundleText('go') }));
    expect(problems).toEqual([
      'python.bundle.json: holds the go bundle, so the file name is wrong',
    ]);
  });

  it('refuses invalid JSON and bundles that break the schema, reporting every problem', async () => {
    const wrongVersion = { ...bundle('java'), schemaVersion: 2 };
    const problems = await problemsOf(
      contentDirectory({
        'go.bundle.json': '{ not json',
        'java.bundle.json': JSON.stringify(wrongVersion),
        'python.bundle.json': bundleText('python'),
      }),
    );
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^go\.bundle\.json: not valid JSON/);
    expect(problems[1]).toMatch(/^java\.bundle\.json: does not match the bundle schema/);
  });

  it('refuses a missing directory', async () => {
    const problems = await problemsOf(join(tmpdir(), 'no-such-content-directory-for-tests'));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^cannot read the content directory/);
  });
});
