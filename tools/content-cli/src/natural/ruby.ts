import type { JapaneseSegment } from '@typing-trainer/block-compiler';

import { isKana, isKanji } from './joyo';

/** A segment with the 1-based column, in characters, where it starts in the source line. */
export interface RubySegment extends JapaneseSegment {
  readonly column: number;
}

export interface RubyError {
  readonly code:
    | 'missing-reading'
    | 'missing-base'
    | 'unclosed-bracket'
    | 'unmatched-bracket'
    | 'nested-bracket'
    | 'empty-reading'
    | 'reading-not-kana';
  readonly column: number;
  readonly message: string;
}

/**
 * Reads a line of Japanese with readings (§13.4): `今日[きょう]は晴[は]れです`. A reading in
 * brackets follows a run of kanji and belongs to all of it; every other character is its own
 * reading. Every kanji must have a reading, and a reading is kana (with ー) only. What the other
 * characters are is left to the character check, which knows what each kind of block allows.
 */
export function parseRuby(line: string): { segments: RubySegment[]; errors: RubyError[] } {
  const characters = Array.from(line);
  const segments: RubySegment[] = [];
  const errors: RubyError[] = [];
  let run = '';
  let runStart = 0;
  const closeRun = (): void => {
    if (run === '') return;
    errors.push({
      code: 'missing-reading',
      column: runStart + 1,
      message: `"${run}" has no reading: write ${run}[かな]`,
    });
    run = '';
  };

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index] ?? '';
    if (character === '[') {
      const start = index;
      let reading = '';
      let closed = false;
      for (index += 1; index < characters.length; index += 1) {
        const next = characters[index] ?? '';
        if (next === ']') {
          closed = true;
          break;
        }
        if (next === '[') {
          errors.push({
            code: 'nested-bracket',
            column: index + 1,
            message: 'brackets do not nest',
          });
        }
        reading += next;
      }
      if (!closed) {
        errors.push({ code: 'unclosed-bracket', column: start + 1, message: '[ has no ]' });
        run = '';
        continue;
      }
      if (run === '') {
        errors.push({
          code: 'missing-base',
          column: start + 1,
          message: 'a reading follows a kanji, as 今日[きょう]',
        });
      } else if (reading === '') {
        errors.push({ code: 'empty-reading', column: start + 1, message: 'the reading is empty' });
      } else if (!Array.from(reading).every(isKana)) {
        errors.push({
          code: 'reading-not-kana',
          column: start + 2,
          message: `the reading "${reading}" is not hiragana, katakana, or ー`,
        });
      } else {
        segments.push({ display: run, reading, column: runStart + 1 });
      }
      run = '';
    } else if (character === ']') {
      closeRun();
      errors.push({ code: 'unmatched-bracket', column: index + 1, message: '] has no [' });
    } else if (isKanji(character)) {
      if (run === '') runStart = index;
      run += character;
    } else {
      closeRun();
      segments.push({ display: character, reading: character, column: index + 1 });
    }
  }
  closeRun();
  return { segments, errors };
}
