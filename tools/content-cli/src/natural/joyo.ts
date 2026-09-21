import { readFileSync } from 'node:fs';

/** The kanji of the jōyō kanji table (§13.4), read from `joyo-kanji.txt`. */
export const JOYO_KANJI: ReadonlySet<string> = new Set(
  Array.from(
    readFileSync(new URL('./joyo-kanji.txt', import.meta.url), 'utf8')
      .split('\n')
      .filter((line) => !line.startsWith('#'))
      .join(''),
  ),
);

/**
 * Forms that the table lists in one shape and nearly all text and fonts use in another (叱 for 𠮟,
 * 填 for 塡, 剥 for 剝, 頬 for 頰), and 々, which the table treats as a mark rather than a kanji.
 * Content may use either form; the shape outside the Basic Multilingual Plane has poor font support.
 */
const ALSO_ALLOWED = new Set(Array.from('叱填剥頬々'));

export const isAllowedKanji = (character: string): boolean =>
  JOYO_KANJI.has(character) || ALSO_ALLOWED.has(character);

/** A kanji, in the sense of the readings that follow it: any Han character, and the mark 々. */
export const isKanji = (character: string): boolean => /^\p{Script=Han}$/u.test(character);

/** Hiragana, katakana, and the long-vowel mark: what a reading is made of. */
export const isKana = (character: string): boolean => /^[ぁ-ゖァ-ヺー]$/u.test(character);
