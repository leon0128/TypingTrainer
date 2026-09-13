import { createHash } from 'node:crypto';

import {
  ContentBundleSchema,
  canonicalBlocksJson,
  type ContentBundle,
  type ContentLanguage,
  type TypingProgram,
} from '@typing-trainer/contracts';

/** Builds a bundle: blocks sorted by blockId and a revision hashing their canonical JSON. */
export function buildBundle(
  language: ContentLanguage,
  programs: readonly TypingProgram[],
): ContentBundle {
  const blocks = [...programs].sort((a, b) => (a.blockId < b.blockId ? -1 : 1));
  const revision = createHash('sha256').update(canonicalBlocksJson(blocks)).digest('hex');
  return ContentBundleSchema.parse({ schemaVersion: 1, language, revision, blocks });
}

/** Deterministic file text: fixed key order, two-space indentation, trailing newline. */
export function serializeBundle(bundle: ContentBundle): string {
  const blocks: unknown = JSON.parse(canonicalBlocksJson(bundle.blocks));
  const ordered = {
    schemaVersion: bundle.schemaVersion,
    language: bundle.language,
    revision: bundle.revision,
    blocks,
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export const bundlePath = (language: ContentLanguage): string =>
  `content/dist/${language}.bundle.json`;
