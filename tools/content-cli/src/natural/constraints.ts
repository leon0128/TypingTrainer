import type { PoolKind } from '@typing-trainer/contracts';

import type { ContentDiagnostic } from '../diagnostics';
import { isAllowedKanji, isKana } from './joyo';
import type { RubySegment } from './ruby';
import type { SourceBlock } from './source';

/** No line is wider than this, in columns (§8.1: the play column shows about 88 characters). */
export const MAX_LINE_COLUMNS = 88;

export const WORD_LETTERS = { min: 2, max: 16 } as const;
export const LINE_WORDS = { min: 3, max: 15 } as const;
export const PARAGRAPH_LINES = { min: 2, max: 10 } as const;
export const PARAGRAPH_LINE_WORDS = { min: 2, max: 15 } as const;
/** Japanese, in kana of reading. */
export const JA_WORD_KANA = { min: 2, max: 12 } as const;
export const JA_LINE_KANA = { min: 6 } as const;

type Report = (line: number, column: number, code: string, message: string) => void;

function reporter(file: string, diagnostics: ContentDiagnostic[]): Report {
  return (line, column, code, message) => {
    diagnostics.push({ file, line, column, stage: 'constraints', code, message });
  };
}

const ENGLISH_CHARACTERS: Record<PoolKind, RegExp> = {
  word: /^[A-Za-z]$/,
  line: /^[A-Za-z' -]$/,
  paragraph: /^[A-Za-z' ,.-]$/,
};

const paragraphLines = (count: number): string =>
  `a paragraph has ${String(PARAGRAPH_LINES.min)}-${String(PARAGRAPH_LINES.max)} lines, this one has ${String(count)}`;

/** Character, shape, and width checks for one English block (§13.4). */
export function englishDiagnostics(
  kind: PoolKind,
  block: SourceBlock,
  file: string,
): ContentDiagnostic[] {
  const diagnostics: ContentDiagnostic[] = [];
  const report = reporter(file, diagnostics);
  const first = block.lines[0]?.number ?? 1;

  if (kind === 'paragraph') {
    const count = block.lines.length;
    if (count < PARAGRAPH_LINES.min || count > PARAGRAPH_LINES.max) {
      report(first, 1, 'line-count', paragraphLines(count));
    }
    if (!block.lines.some((line) => /[,.]/.test(line.text))) {
      report(first, 1, 'no-punctuation', 'a paragraph contains a comma or a period');
    }
  }

  for (const { text, number } of block.lines) {
    const before = diagnostics.length;
    Array.from(text).forEach((character, index) => {
      if (ENGLISH_CHARACTERS[kind].test(character)) return;
      if (kind !== 'paragraph' && (character === ',' || character === '.')) {
        report(number, index + 1, 'punctuation', 'commas and periods are only for paragraphs');
      } else {
        report(number, index + 1, 'character', `"${character}" is not allowed in a ${kind}`);
      }
    });
    if (diagnostics.length > before) continue;

    if (kind === 'word') {
      if (text.length < WORD_LETTERS.min || text.length > WORD_LETTERS.max) {
        report(
          number,
          1,
          'word-shape',
          `a word has ${String(WORD_LETTERS.min)}-${String(WORD_LETTERS.max)} letters`,
        );
      }
      continue;
    }
    if (text.includes('  ')) {
      report(number, text.indexOf('  ') + 1, 'spacing', 'words are separated by one space');
    }
    const words = text.split(' ').filter((word) => word !== '');
    if (words.some((word) => !/[A-Za-z]/.test(word))) {
      report(number, 1, 'word-shape', 'every word has a letter');
    }
    const limits = kind === 'line' ? LINE_WORDS : PARAGRAPH_LINE_WORDS;
    if (words.length < limits.min || words.length > limits.max) {
      report(
        number,
        1,
        'word-count',
        `a ${kind === 'line' ? 'sentence' : 'line of a paragraph'} has ${String(limits.min)}-${String(limits.max)} words, this one has ${String(words.length)}`,
      );
    }
    if (text.length > MAX_LINE_COLUMNS) {
      report(
        number,
        MAX_LINE_COLUMNS + 1,
        'line-width',
        `a line is at most ${String(MAX_LINE_COLUMNS)} columns, this one has ${String(text.length)}`,
      );
    }
  }
  return diagnostics;
}

const isMark = (segment: RubySegment): boolean =>
  segment.display === segment.reading && (segment.display === '、' || segment.display === '。');

/** Character and shape checks for one Japanese block, from its parsed lines (§13.4). */
export function japaneseDiagnostics(
  kind: PoolKind,
  block: SourceBlock,
  segments: readonly (readonly RubySegment[])[],
  file: string,
): ContentDiagnostic[] {
  const diagnostics: ContentDiagnostic[] = [];
  const report = reporter(file, diagnostics);
  const first = block.lines[0]?.number ?? 1;
  let marks = 0;

  if (kind === 'paragraph') {
    const count = block.lines.length;
    if (count < PARAGRAPH_LINES.min || count > PARAGRAPH_LINES.max) {
      report(first, 1, 'line-count', paragraphLines(count));
    }
  }

  segments.forEach((lineSegments, index) => {
    const number = block.lines[index]?.number ?? first;
    let kana = 0;
    let displayCharacters = 0;
    for (const segment of lineSegments) {
      displayCharacters += Array.from(segment.display).length;
      if (segment.display !== segment.reading) {
        kana += Array.from(segment.reading).length;
        Array.from(segment.display).forEach((character, offset) => {
          if (!isAllowedKanji(character)) {
            report(
              number,
              segment.column + offset,
              'kanji-not-joyo',
              `"${character}" is not in the jōyō kanji table: write it in kana`,
            );
          }
        });
      } else if (isMark(segment)) {
        marks += 1;
        if (kind !== 'paragraph') {
          report(number, segment.column, 'punctuation', '、 and 。 are only for paragraphs');
        }
      } else if (isKana(segment.display)) {
        kana += 1;
      } else {
        report(
          number,
          segment.column,
          'character',
          `"${segment.display}" is not allowed in Japanese text`,
        );
      }
    }
    if (kind === 'word' && (kana < JA_WORD_KANA.min || kana > JA_WORD_KANA.max)) {
      report(
        number,
        1,
        'word-shape',
        `a word has ${String(JA_WORD_KANA.min)}-${String(JA_WORD_KANA.max)} kana of reading, this one has ${String(kana)}`,
      );
    }
    if (kind === 'line' && kana < JA_LINE_KANA.min) {
      report(
        number,
        1,
        'word-shape',
        `a sentence has at least ${String(JA_LINE_KANA.min)} kana of reading, this one has ${String(kana)}`,
      );
    }
    if (displayCharacters * 2 > MAX_LINE_COLUMNS) {
      report(
        number,
        1,
        'line-width',
        `a line is at most ${String(MAX_LINE_COLUMNS / 2)} characters wide (${String(MAX_LINE_COLUMNS)} columns), this one has ${String(displayCharacters)}`,
      );
    }
  });

  if (kind === 'paragraph' && marks === 0) {
    report(first, 1, 'no-punctuation', 'a paragraph contains 、 or 。');
  }
  return diagnostics;
}
