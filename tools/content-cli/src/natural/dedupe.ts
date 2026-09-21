import type { PoolKind } from '@typing-trainer/contracts';

import { jaccard } from '../dedupe';
import type { ContentDiagnostic } from '../diagnostics';

/**
 * Sentences and paragraphs at or above this Jaccard similarity of their n-grams are duplicates of
 * an earlier block (§5.2 stage 7). Provisional: chosen before there was content to measure, and to
 * be set from the most similar pair of distinct blocks once there is.
 */
export const NATURAL_SIMILARITY_THRESHOLD = 0.85;

export interface NaturalDedupeEntry {
  readonly file: string;
  /** 1-based line of the block's first line. */
  readonly line: number;
  /** What identical blocks share: the shown text, lowercased for English. */
  readonly key: string;
  readonly grams: ReadonlySet<string>;
}

function gramsOf(items: readonly string[], size: number): Set<string> {
  const grams = new Set<string>();
  for (let index = 0; index + size <= items.length; index += 1) {
    grams.add(JSON.stringify(items.slice(index, index + size)));
  }
  return grams;
}

/** Word 3-grams of lowercased English. */
export function englishGrams(text: string): Set<string> {
  return gramsOf(
    text
      .toLowerCase()
      .split(/[^a-z']+/)
      .filter((word) => word !== ''),
    3,
  );
}

/** Character 4-grams of the reading of Japanese. */
export function japaneseGrams(reading: string): Set<string> {
  return gramsOf(Array.from(reading), 4);
}

/**
 * Reports blocks identical to an earlier one, and, for sentences and paragraphs, blocks too
 * similar to one. A word has too few n-grams to compare, so only identical words are reported.
 */
export function naturalDedupeDiagnostics(
  kind: PoolKind,
  entries: readonly NaturalDedupeEntry[],
): ContentDiagnostic[] {
  const diagnostics: ContentDiagnostic[] = [];
  const seen: NaturalDedupeEntry[] = [];
  for (const entry of entries) {
    const report = (code: string, message: string): void => {
      diagnostics.push({
        file: entry.file,
        line: entry.line,
        column: 1,
        stage: 'dedupe',
        code,
        message,
      });
    };
    const same = seen.find((other) => other.key === entry.key);
    if (same !== undefined) {
      report('duplicate', `identical to line ${String(same.line)}`);
    } else if (kind !== 'word' && entry.grams.size > 0) {
      for (const other of seen) {
        if (other.grams.size === 0) continue;
        const score = jaccard(entry.grams, other.grams);
        if (score >= NATURAL_SIMILARITY_THRESHOLD) {
          report(
            'similar',
            `too similar to line ${String(other.line)} (Jaccard ${score.toFixed(3)} >= ${String(NATURAL_SIMILARITY_THRESHOLD)})`,
          );
          break;
        }
      }
    }
    seen.push(entry);
  }
  return diagnostics;
}
