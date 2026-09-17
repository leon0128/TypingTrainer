import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  ContentBundleSchema,
  canonicalBlocksJson,
  type ContentBundle,
  type ContentLanguage,
  type TypingProgram,
} from '@typing-trainer/contracts';
import { z } from 'zod';

const BUNDLE_SUFFIX = '.bundle.json';

/** One language's compiled blocks, ready to issue. */
export interface LoadedBundle {
  readonly language: ContentLanguage;
  readonly revision: string;
  /** Sorted, as in the bundle. */
  readonly blockIds: readonly string[];
  readonly programs: ReadonlyMap<string, TypingProgram>;
}

/** The content bundles the API serves (§5.2, §9.3), loaded once at startup. */
export class ContentLibrary {
  private readonly bundles: ReadonlyMap<string, LoadedBundle>;

  constructor(bundles: readonly ContentBundle[]) {
    this.bundles = new Map(
      bundles.map((bundle) => [
        bundle.language,
        {
          language: bundle.language,
          revision: bundle.revision,
          blockIds: bundle.blocks.map((block) => block.blockId),
          programs: new Map(bundle.blocks.map((block) => [block.blockId, block])),
        },
      ]),
    );
  }

  /** Languages with a bundle, sorted. */
  get languages(): string[] {
    return [...this.bundles.keys()].sort();
  }

  has(language: string): boolean {
    return this.bundles.has(language);
  }

  get(language: string): LoadedBundle | undefined {
    return this.bundles.get(language);
  }
}

export class ContentLoadError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`content bundles are invalid:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
    this.name = 'ContentLoadError';
  }
}

/**
 * Reads every `<language>.bundle.json` in the directory; other files (such as toolchains.json) are
 * ignored. Each bundle must match ContentBundleSchema, be named after its language, and carry the
 * revision recomputed from its blocks, so a corrupted or hand-edited bundle is never served. All
 * problems are reported together.
 */
export async function loadContentLibrary(directory: string): Promise<ContentLibrary> {
  let files: string[];
  try {
    files = (await readdir(directory)).filter((file) => file.endsWith(BUNDLE_SUFFIX)).sort();
  } catch (error) {
    throw new ContentLoadError([
      `cannot read the content directory ${directory}: ${String(error)}`,
    ]);
  }

  const problems: string[] = [];
  const bundles: ContentBundle[] = [];
  for (const file of files) {
    let json: unknown;
    try {
      json = JSON.parse(await readFile(join(directory, file), 'utf8'));
    } catch (error) {
      problems.push(`${file}: not valid JSON (${String(error)})`);
      continue;
    }
    const parsed = ContentBundleSchema.safeParse(json);
    if (!parsed.success) {
      problems.push(`${file}: does not match the bundle schema\n${z.prettifyError(parsed.error)}`);
      continue;
    }
    const bundle = parsed.data;
    if (file !== `${bundle.language}${BUNDLE_SUFFIX}`) {
      problems.push(`${file}: holds the ${bundle.language} bundle, so the file name is wrong`);
      continue;
    }
    const revision = createHash('sha256').update(canonicalBlocksJson(bundle.blocks)).digest('hex');
    if (revision !== bundle.revision) {
      problems.push(`${file}: revision ${bundle.revision} does not match its blocks (${revision})`);
      continue;
    }
    bundles.push(bundle);
  }

  if (problems.length > 0) throw new ContentLoadError(problems);
  return new ContentLibrary(bundles);
}
