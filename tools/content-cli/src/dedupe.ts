import { createHash } from 'node:crypto';

import type { Token } from '@typing-trainer/block-compiler';

import type { ContentDiagnostic } from './diagnostics';
import type { LanguageConfig } from './languages';

/**
 * Blocks at or above this Jaccard similarity are duplicates (§5.2 stage 7). Measured on the P0
 * compiler fixtures before adoption: the most similar pair of distinct fixtures scored 0.273 (Java
 * nested-generics and streams), a copy with renamed identifiers 1.000, and a copy with one extra
 * line 0.727, which this threshold does not catch.
 */
export const SIMILARITY_THRESHOLD = 0.9;
const GRAM_SIZE = 4;
const IDENTIFIER_PLACEHOLDER = '<id>';

export interface DedupeEntry {
  readonly file: string;
  /** The source handed to the compiler (normalized). */
  readonly prepared: string;
  readonly tokens: readonly Token[];
}

/** Token 4-grams with identifiers replaced, so renamed copies of a block look identical. */
export function shingles(config: LanguageConfig, tokens: readonly Token[]): Set<string> {
  const texts = tokens.map((token) =>
    config.isIdentifier(token) ? IDENTIFIER_PLACEHOLDER : token.text,
  );
  const grams = new Set<string>();
  for (let index = 0; index + GRAM_SIZE <= texts.length; index += 1) {
    grams.add(JSON.stringify(texts.slice(index, index + GRAM_SIZE)));
  }
  return grams;
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Reports exact duplicates and near-duplicates within one language, against earlier files. */
export function dedupeDiagnostics(
  config: LanguageConfig,
  entries: readonly DedupeEntry[],
): ContentDiagnostic[] {
  const diagnostics: ContentDiagnostic[] = [];
  const seen: { entry: DedupeEntry; hash: string; grams: Set<string> }[] = [];
  for (const entry of entries) {
    const hash = createHash('sha256').update(entry.prepared).digest('hex');
    const grams = shingles(config, entry.tokens);
    const exact = seen.find((other) => other.hash === hash);
    if (exact !== undefined) {
      diagnostics.push({
        file: entry.file,
        line: 1,
        column: 1,
        stage: 'dedupe',
        code: 'duplicate',
        message: `identical to ${exact.entry.file}`,
      });
    } else {
      for (const other of seen) {
        const score = jaccard(grams, other.grams);
        if (score >= SIMILARITY_THRESHOLD) {
          diagnostics.push({
            file: entry.file,
            line: 1,
            column: 1,
            stage: 'dedupe',
            code: 'similar',
            message: `too similar to ${other.entry.file} (Jaccard ${score.toFixed(3)} >= ${String(SIMILARITY_THRESHOLD)})`,
          });
          break;
        }
      }
    }
    seen.push({ entry, hash, grams });
  }
  return diagnostics;
}
