import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { JapaneseCompileError, compileJapanese } from '@typing-trainer/block-compiler';
import {
  NATURAL_POOLS,
  poolKindOf,
  trackOf,
  type ContentLanguage,
  type PoolKind,
  type TypingProgram,
} from '@typing-trainer/contracts';

import { buildBundle, serializeBundle, type BuiltBundle } from '../bundle';
import type { ContentDiagnostic } from '../diagnostics';
import { MAX_LINE_COLUMNS, englishDiagnostics, japaneseDiagnostics } from './constraints';
import {
  englishGrams,
  japaneseGrams,
  naturalDedupeDiagnostics,
  type NaturalDedupeEntry,
} from './dedupe';
import { compileEnglish } from './english';
import { parseRuby, type RubySegment } from './ruby';
import { blockSource, parsePoolFile, type SourceBlock } from './source';

/** The file that lists every kanji word of the Japanese pools with its reading (§13.4). */
export const READINGS_FILE = 'content/natural/ja/readings.txt';

/** Files the pipeline writes besides bundles: what `build` writes and `check` compares. */
export const GENERATED_FILES: readonly string[] = [READINGS_FILE];

export interface NaturalResult {
  readonly diagnostics: ContentDiagnostic[];
  readonly bundles: Map<ContentLanguage, BuiltBundle>;
  /** Generated files by repository-relative path. */
  readonly files: Map<string, string>;
}

const languageOf = (pool: ContentLanguage): 'ja' | 'en' =>
  trackOf(pool) === 'natural-ja' ? 'ja' : 'en';

/** Where the blocks of a pool are written. */
export function poolSourcePath(pool: ContentLanguage): string {
  return `content/natural/${languageOf(pool)}/${poolKindOf(pool) ?? 'word'}.txt`;
}

/**
 * A block's id: the pool and the first eight hex digits of the hash of its text. It does not
 * depend on where in the file the block is, so adding or removing one changes nothing else.
 */
export function naturalBlockId(pool: ContentLanguage, source: string): string {
  return `${pool}/${createHash('sha256').update(source).digest('hex').slice(0, 8)}`;
}

function discoverDiagnostics(root: string): ContentDiagnostic[] {
  const diagnostics: ContentDiagnostic[] = [];
  const base = join(root, 'content', 'natural');
  const report = (file: string, message: string): void => {
    diagnostics.push({ file, line: 1, column: 1, stage: 'discover', code: 'file-name', message });
  };
  for (const name of readdirSync(base).sort()) {
    const file = `content/natural/${name}`;
    if (!statSync(join(base, name)).isDirectory()) {
      if (name !== 'AUTHORING_NOTES.md') report(file, 'unexpected file');
    } else if (name !== 'en' && name !== 'ja') {
      report(file, 'the directories are en and ja');
    } else {
      const allowed = [
        'word.txt',
        'line.txt',
        'paragraph.txt',
        ...(name === 'ja' ? ['readings.txt'] : []),
      ];
      for (const entry of readdirSync(join(base, name)).sort()) {
        if (!allowed.includes(entry)) {
          report(`${file}/${entry}`, `the files are ${allowed.join(', ')}`);
        }
      }
    }
  }
  return diagnostics;
}

interface BlockOutcome {
  readonly program?: TypingProgram;
  readonly entry?: NaturalDedupeEntry;
  readonly readings: readonly string[];
}

/** Columns of each line of a Japanese program: the shown romaji of every unit, per line. */
function romajiWidths(program: TypingProgram): number[] {
  const widths = [0];
  for (const atom of program.atoms) {
    if (atom.kind === 'separator') widths.push(0);
    else if (atom.kind === 'romaji') {
      widths[widths.length - 1] = (widths.at(-1) ?? 0) + (atom.alternatives[0] ?? '').length;
    }
  }
  return widths;
}

function checkEnglishBlock(
  pool: ContentLanguage,
  kind: PoolKind,
  block: SourceBlock,
  id: string,
  file: string,
  diagnostics: ContentDiagnostic[],
): BlockOutcome {
  const found = englishDiagnostics(kind, block, file);
  diagnostics.push(...found);
  if (found.length > 0) return { readings: [] };
  const lines = block.lines.map((line) => line.text);
  return {
    program: compileEnglish(id, lines),
    entry: {
      file,
      line: block.lines[0]?.number ?? 1,
      key: lines.join(' ').toLowerCase(),
      grams: englishGrams(lines.join(' ')),
    },
    readings: [],
  };
}

function checkJapaneseBlock(
  kind: PoolKind,
  block: SourceBlock,
  id: string,
  file: string,
  diagnostics: ContentDiagnostic[],
): BlockOutcome {
  const parsed = block.lines.map((line) => ({ number: line.number, ...parseRuby(line.text) }));
  const syntax = parsed.flatMap(({ number, errors }) =>
    errors.map((error): ContentDiagnostic => ({
      file,
      line: number,
      column: error.column,
      stage: 'parse',
      code: error.code,
      message: error.message,
    })),
  );
  diagnostics.push(...syntax);
  if (syntax.length > 0) return { readings: [] };

  const segments: (readonly RubySegment[])[] = parsed.map(({ segments: line }) => line);
  const found = japaneseDiagnostics(kind, block, segments, file);
  diagnostics.push(...found);
  if (found.length > 0) return { readings: [] };

  let program: TypingProgram;
  try {
    program = compileJapanese(
      id,
      segments.map((line) => line.map(({ display, reading }) => ({ display, reading }))),
    );
  } catch (error) {
    if (!(error instanceof JapaneseCompileError)) throw error;
    // The error's position is in the joined reading of its line; show it at the segment there.
    let remaining = error.column;
    const lineSegments = segments[error.line] ?? [];
    const at = lineSegments.find((segment) => {
      remaining -= Array.from(segment.reading).length;
      return remaining < 0;
    });
    diagnostics.push({
      file,
      line: block.lines[error.line]?.number ?? block.lines[0]?.number ?? 1,
      column: at?.column ?? 1,
      stage: 'compile',
      code: error.code,
      message: error.detail,
    });
    return { readings: [] };
  }

  romajiWidths(program).forEach((width, index) => {
    if (width > MAX_LINE_COLUMNS) {
      diagnostics.push({
        file,
        line: block.lines[index]?.number ?? 1,
        column: 1,
        stage: 'constraints',
        code: 'line-width',
        message: `the romaji of a line is at most ${String(MAX_LINE_COLUMNS)} columns, this one has ${String(width)}`,
      });
    }
  });

  const all = segments.flat();
  return {
    program,
    entry: {
      file,
      line: block.lines[0]?.number ?? 1,
      key: segments.map((line) => line.map((s) => s.display).join('')).join('\n'),
      grams: japaneseGrams(all.map((segment) => segment.reading).join('')),
    },
    readings: all
      .filter((segment) => segment.display !== segment.reading)
      .map((segment) => `${segment.display}\t${segment.reading}`),
  };
}

const READINGS_HEADER = [
  '# Every kanji word of the Japanese pools with the reading it is given, one pair a line, sorted.',
  '# Generated by pnpm content:build; review the pairs a change adds, and do not edit this file.',
  '',
].join('\n');

/**
 * Runs the pipeline for the natural-language pools (§13.4): discover, parse, constraints, compile,
 * dedupe, and bundle, for every pool whose file exists. The Japanese pools also yield the readings
 * file. A pool with any diagnostic gets no bundle.
 */
export function runNaturalPipeline(root: string): NaturalResult {
  const result: NaturalResult = { diagnostics: [], bundles: new Map(), files: new Map() };
  if (!existsSync(join(root, 'content', 'natural'))) return result;
  result.diagnostics.push(...discoverDiagnostics(root));

  const readings = new Set<string>();
  let japaneseClean = true;
  for (const pool of NATURAL_POOLS) {
    const kind = poolKindOf(pool);
    const file = poolSourcePath(pool);
    if (kind === null || !existsSync(join(root, file))) continue;

    const source = parsePoolFile(readFileSync(join(root, file), 'utf8'), kind, file);
    const poolDiagnostics: ContentDiagnostic[] = [...source.diagnostics];
    const programs: TypingProgram[] = [];
    const entries: NaturalDedupeEntry[] = [];
    const owners = new Map<string, string>();

    for (const block of source.blocks) {
      const text = blockSource(block);
      const id = naturalBlockId(pool, text);
      const outcome =
        languageOf(pool) === 'ja'
          ? checkJapaneseBlock(kind, block, id, file, poolDiagnostics)
          : checkEnglishBlock(pool, kind, block, id, file, poolDiagnostics);
      const owner = owners.get(id);
      if (owner !== undefined && owner !== text) {
        poolDiagnostics.push({
          file,
          line: block.lines[0]?.number ?? 1,
          column: 1,
          stage: 'bundle',
          code: 'id-collision',
          message: `the hash of this block equals that of another (${id}); reword one`,
        });
      }
      owners.set(id, text);
      if (outcome.program !== undefined) programs.push(outcome.program);
      if (outcome.entry !== undefined) entries.push(outcome.entry);
      for (const pair of outcome.readings) readings.add(pair);
    }

    poolDiagnostics.push(...naturalDedupeDiagnostics(kind, entries));
    result.diagnostics.push(...poolDiagnostics);
    if (poolDiagnostics.length > 0 && languageOf(pool) === 'ja') japaneseClean = false;
    if (poolDiagnostics.length === 0 && programs.length > 0) {
      const bundle = buildBundle(pool, programs);
      result.bundles.set(pool, { bundle, text: serializeBundle(bundle) });
    }
  }

  if (japaneseClean && readings.size > 0) {
    result.files.set(READINGS_FILE, `${READINGS_HEADER}${[...readings].sort().join('\n')}\n`);
  }
  return result;
}
