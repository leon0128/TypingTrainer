import {
  TypingProgramSchema,
  countCanonicalKeystrokes,
  type Atom,
  type RomajiAtom,
  type TypingProgram,
} from '@typing-trainer/contracts';

/**
 * Compiles Japanese text into a typing program of romaji units (§13.5).
 *
 * The text arrives as segments: a kanji word with its reading, or kana that is its own reading.
 * Each line's readings are joined and cut into typing units, each with the spellings the player
 * may use, and the unit that holds the start of a segment shows that segment's text above it.
 * Nothing here runs in the browser: the units, and so every spelling, are fixed when the content
 * is built, and the engine only matches keys against them.
 */

export type JapaneseCompileErrorCode =
  /** A kana or mark that has no spelling: a lone small kana, ゐ, ヴ, or anything else unlisted. */
  | 'unsupported-kana'
  /** A sokuon before ん, another っ, ー, or a mark: no spelling is defined for it. */
  | 'unsupported-sequence'
  | 'empty-line'
  /** A reading holding anything but kana, ー, 、, and 。. */
  | 'reading-not-kana';

export class JapaneseCompileError extends Error {
  constructor(
    readonly code: JapaneseCompileErrorCode,
    /** Zero-based line of the block. */
    readonly line: number,
    /** Zero-based position in the line's joined reading, or 0 when the whole line is at fault. */
    readonly column: number,
    message: string,
  ) {
    super(`line ${String(line + 1)}, reading position ${String(column + 1)}: ${message}`);
    this.name = 'JapaneseCompileError';
  }
}

export interface JapaneseSegment {
  /** What is shown above the romaji: kanji, or the kana itself. */
  readonly display: string;
  /** The reading, in hiragana or katakana; `ー`, `、`, and `。` are allowed. */
  readonly reading: string;
}

/** Kana that are their own reading, one segment each. */
export function kanaSegments(text: string): JapaneseSegment[] {
  return Array.from(text).map((character) => ({ display: character, reading: character }));
}

/**
 * The spellings of every kana and combination the content may use, keyed by hiragana. The first
 * spelling is the one shown (Hepburn where the two differ), and the rest are also accepted. A
 * kana that is not here cannot be used in a block.
 */
const SPELLINGS: Record<string, readonly string[]> = {
  あ: ['a'],
  い: ['i'],
  う: ['u'],
  え: ['e'],
  お: ['o'],
  か: ['ka'],
  き: ['ki'],
  く: ['ku'],
  け: ['ke'],
  こ: ['ko'],
  さ: ['sa'],
  し: ['shi', 'si'],
  す: ['su'],
  せ: ['se'],
  そ: ['so'],
  た: ['ta'],
  ち: ['chi', 'ti'],
  つ: ['tsu', 'tu'],
  て: ['te'],
  と: ['to'],
  な: ['na'],
  に: ['ni'],
  ぬ: ['nu'],
  ね: ['ne'],
  の: ['no'],
  は: ['ha'],
  ひ: ['hi'],
  ふ: ['fu', 'hu'],
  へ: ['he'],
  ほ: ['ho'],
  ま: ['ma'],
  み: ['mi'],
  む: ['mu'],
  め: ['me'],
  も: ['mo'],
  や: ['ya'],
  ゆ: ['yu'],
  よ: ['yo'],
  ら: ['ra'],
  り: ['ri'],
  る: ['ru'],
  れ: ['re'],
  ろ: ['ro'],
  わ: ['wa'],
  を: ['wo'],
  が: ['ga'],
  ぎ: ['gi'],
  ぐ: ['gu'],
  げ: ['ge'],
  ご: ['go'],
  ざ: ['za'],
  じ: ['ji', 'zi'],
  ず: ['zu'],
  ぜ: ['ze'],
  ぞ: ['zo'],
  だ: ['da'],
  ぢ: ['di'],
  づ: ['du'],
  で: ['de'],
  ど: ['do'],
  ば: ['ba'],
  び: ['bi'],
  ぶ: ['bu'],
  べ: ['be'],
  ぼ: ['bo'],
  ぱ: ['pa'],
  ぴ: ['pi'],
  ぷ: ['pu'],
  ぺ: ['pe'],
  ぽ: ['po'],
  // Extended kana, for loanwords.
  しぇ: ['she', 'sye'],
  ちぇ: ['che', 'tye'],
  じぇ: ['je', 'jye', 'zye'],
  ふぁ: ['fa'],
  ふぃ: ['fi'],
  ふぇ: ['fe'],
  ふぉ: ['fo'],
  うぃ: ['wi'],
  うぇ: ['we', 'whe'],
  うぉ: ['who'],
  てぃ: ['thi'],
  でぃ: ['dhi'],
};

/** A kana with ゃ, ゅ, or ょ after it: the spellings for ゃ, ゅ, and ょ in turn. */
const YOUON: readonly (readonly [
  kana: string,
  ya: readonly string[],
  yu: readonly string[],
  yo: readonly string[],
])[] = [
  ['き', ['kya'], ['kyu'], ['kyo']],
  ['ぎ', ['gya'], ['gyu'], ['gyo']],
  ['し', ['sha', 'sya'], ['shu', 'syu'], ['sho', 'syo']],
  ['じ', ['ja', 'jya', 'zya'], ['ju', 'jyu', 'zyu'], ['jo', 'jyo', 'zyo']],
  ['ち', ['cha', 'tya'], ['chu', 'tyu'], ['cho', 'tyo']],
  ['ぢ', ['dya'], ['dyu'], ['dyo']],
  ['に', ['nya'], ['nyu'], ['nyo']],
  ['ひ', ['hya'], ['hyu'], ['hyo']],
  ['び', ['bya'], ['byu'], ['byo']],
  ['ぴ', ['pya'], ['pyu'], ['pyo']],
  ['み', ['mya'], ['myu'], ['myo']],
  ['り', ['rya'], ['ryu'], ['ryo']],
];

/** Every kana and combination with its spellings, for tests and tools. */
export const KANA_TABLE: ReadonlyMap<string, readonly string[]> = (() => {
  const table = new Map<string, readonly string[]>(Object.entries(SPELLINGS));
  for (const [kana, ya, yu, yo] of YOUON) {
    table.set(`${kana}ゃ`, ya);
    table.set(`${kana}ゅ`, yu);
    table.set(`${kana}ょ`, yo);
  }
  return table;
})();

const MARKS: Readonly<Record<string, string>> = { ー: '-', '、': ',', '。': '.' };

/** Hiragana and katakana, the long-vowel mark, and the two punctuation marks. */
const READING_CHARACTER = /^[ぁ-ゖァ-ヶー、。]$/u;

/** Katakana to hiragana, so one table serves both; every other character is unchanged. */
function toHiragana(text: string): string {
  return Array.from(text)
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : character;
    })
    .join('');
}

type Token =
  | {
      readonly kind: 'kana' | 'mark';
      readonly start: number;
      readonly spellings: readonly string[];
    }
  | { readonly kind: 'sokuon' | 'hatsuon'; readonly start: number };

interface Unit {
  /** The reading positions this unit covers, `start` to `end` exclusive. */
  readonly start: number;
  readonly end: number;
  readonly spellings: readonly string[];
}

/** Cuts a normalized reading into tokens, taking the longest kana combination at each position. */
function tokenize(reading: string, line: number): (Token & { end: number })[] {
  const tokens: (Token & { end: number })[] = [];
  let index = 0;
  while (index < reading.length) {
    const character = reading.charAt(index);
    const mark = MARKS[character];
    if (character === 'っ') {
      tokens.push({ kind: 'sokuon', start: index, end: index + 1 });
      index += 1;
    } else if (character === 'ん') {
      tokens.push({ kind: 'hatsuon', start: index, end: index + 1 });
      index += 1;
    } else if (mark !== undefined) {
      tokens.push({ kind: 'mark', start: index, end: index + 1, spellings: [mark] });
      index += 1;
    } else {
      const pair = reading.slice(index, index + 2);
      const two = KANA_TABLE.get(pair);
      const one = KANA_TABLE.get(character);
      const spellings = two ?? one;
      if (spellings === undefined) {
        throw new JapaneseCompileError(
          'unsupported-kana',
          line,
          index,
          `"${character}" has no romaji spelling`,
        );
      }
      const length = two === undefined ? 1 : 2;
      tokens.push({ kind: 'kana', start: index, end: index + length, spellings });
      index += length;
    }
  }
  return tokens;
}

/** A sokuon before a kana with these spellings: the consonant doubled, or a small tsu typed. */
function sokuonSpellings(following: readonly string[]): string[] {
  const spellings: string[] = [];
  const add = (spelling: string): void => {
    if (!spellings.includes(spelling)) spellings.push(spelling);
  };
  for (const spelling of following) {
    // Hepburn `tchi`, and the doubled `cchi` that IMEs also accept.
    if (spelling.startsWith('ch')) add(`t${spelling}`);
    // A vowel or an n cannot be doubled: `nn` would be ん.
    if (!/^[aiueon]/.test(spelling)) add(`${spelling.charAt(0)}${spelling}`);
  }
  for (const small of ['xtu', 'ltu', 'xtsu', 'ltsu']) {
    for (const spelling of following) add(`${small}${spelling}`);
  }
  return spellings;
}

/**
 * Turns one line's readings into units. They are built from the right, because the spellings of ん
 * and っ depend on the unit after them:
 *
 * - ん is `nn`, `n'`, or `xn`, and also a bare `n` when a unit follows on the line and none of its
 *   spellings starts with a vowel, `n`, or `y`; otherwise the next key could not tell ん from the
 *   start of that unit (`nn` before な, `ny` before や).
 * - っ takes the unit after it, and is spelled by doubling that unit's first consonant or with a
 *   small tsu; at the end of a line it stands alone.
 */
function buildUnits(reading: string, line: number): Unit[] {
  const tokens = tokenize(reading, line);
  const units: Unit[] = [];
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (token === undefined) continue;
    const following = units[0];
    if (token.kind === 'kana' || token.kind === 'mark') {
      units.unshift({ start: token.start, end: token.end, spellings: token.spellings });
    } else if (token.kind === 'hatsuon') {
      const bare = following?.spellings.every((s) => !/^[aiueony]/.test(s)) === true;
      units.unshift({
        start: token.start,
        end: token.end,
        spellings: bare ? ['n', 'nn', "n'", 'xn'] : ['nn', "n'", 'xn'],
      });
    } else if (following === undefined) {
      units.unshift({
        start: token.start,
        end: token.end,
        spellings: ['xtu', 'ltu', 'xtsu', 'ltsu'],
      });
    } else {
      if (tokens[index + 1]?.kind !== 'kana') {
        throw new JapaneseCompileError(
          'unsupported-sequence',
          line,
          token.start,
          'っ must be followed by a kana, not ん, っ, ー, or a mark',
        );
      }
      units.shift();
      units.unshift({
        start: token.start,
        end: following.end,
        spellings: sokuonSpellings(following.spellings),
      });
    }
  }
  return units;
}

function compileLine(segments: readonly JapaneseSegment[], line: number): RomajiAtom[] {
  let reading = '';
  const starts: { position: number; display: string }[] = [];
  for (const segment of segments) {
    if (segment.reading === '') continue;
    for (const [offset, character] of Array.from(segment.reading).entries()) {
      if (!READING_CHARACTER.test(character)) {
        throw new JapaneseCompileError(
          'reading-not-kana',
          line,
          reading.length + offset,
          `"${character}" is not kana`,
        );
      }
    }
    starts.push({ position: reading.length, display: segment.display });
    reading += segment.reading;
  }
  if (reading === '') {
    throw new JapaneseCompileError('empty-line', line, 0, 'a line needs at least one kana');
  }

  return buildUnits(toHiragana(reading), line).map((unit) => ({
    kind: 'romaji',
    // The segments whose first kana lies in this unit; none for a unit that continues a reading.
    display: starts
      .filter(({ position }) => position >= unit.start && position < unit.end)
      .map(({ display }) => display)
      .join(''),
    alternatives: [...unit.spellings],
  }));
}

/**
 * Compiles a block of Japanese: one array of segments per line, each line a romaji unit per typing
 * unit, and lines joined by a required Enter (§13.5). Throws `JapaneseCompileError` for text that
 * cannot be typed.
 */
export function compileJapanese(
  blockId: string,
  lines: readonly (readonly JapaneseSegment[])[],
): TypingProgram {
  const atoms: Atom[] = [];
  lines.forEach((segments, line) => {
    if (line > 0) atoms.push({ kind: 'separator', canonical: '\n', required: true });
    atoms.push(...compileLine(segments, line));
  });
  return TypingProgramSchema.parse({
    blockId,
    atoms,
    canonicalKeystrokes: countCanonicalKeystrokes(atoms),
  });
}
