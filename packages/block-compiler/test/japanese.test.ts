import { ContentBundleSchema, type Atom, type TypingProgram } from '@typing-trainer/contracts';
import { describe, expect, it } from 'vitest';

import {
  JapaneseCompileError,
  KANA_TABLE,
  compileJapanese,
  kanaSegments,
  type JapaneseSegment,
} from '../src';
import { render } from './helpers';

/** Whether `typed` (`\n` for Enter) is exactly a way of typing the atoms; no code shared with the compiler. */
function accepts(atoms: readonly Atom[], typed: string, from = 0): boolean {
  const atom = atoms[from];
  if (atom === undefined) return typed === '';
  const spellings =
    atom.kind === 'romaji' ? atom.alternatives : atom.kind === 'separator' ? [atom.canonical] : [];
  return spellings.some(
    (spelling) =>
      typed.startsWith(spelling) && accepts(atoms, typed.slice(spelling.length), from + 1),
  );
}

const line = (text: string): JapaneseSegment[] => kanaSegments(text);
const compile = (...lines: JapaneseSegment[][]): TypingProgram =>
  compileJapanese('ja-word/probe', lines);
const shown = (...lines: JapaneseSegment[][]) => render(compile(...lines).atoms);
const spellingsOf = (text: string) =>
  compile(line(text)).atoms.map((atom) => (atom.kind === 'romaji' ? atom.alternatives : []));

/**
 * Each row is worked out by hand: the text, the spelling shown, the keys of the shortest way to
 * type it, the spellings that must be accepted, and some that must not. A kana's shortest spelling
 * is counted key by key; ん before a vowel, n, y, or the end of a line takes nn (two keys), and a
 * bare n (one key) elsewhere.
 */
const FIXTURES: readonly (readonly [
  text: string,
  shown: string,
  canonical: number,
  accepted: readonly string[],
  refused: readonly string[],
])[] = [
  // ko + nn + ni + (chi | ti) + ha: the ん before に needs nn, so three n in a row.
  [
    'こんにちは',
    'konnnichiha',
    10,
    ['konnnichiha', 'konnnitiha', "kon'nichiha", 'koxnnichiha'],
    ['konnichiha', 'konnitiha'],
  ],
  // shi + n + bu + nn: the first ん is bare before ぶ, the last needs nn.
  [
    'しんぶん',
    'shinbunn',
    7,
    ['shinbunn', 'sinbunn', "shinbun'", 'shinbuxn', 'shinnbunn'],
    ['shinbun', 'shinbunnn'],
  ],
  [
    'きっぷ',
    'kippu',
    5,
    ['kippu', 'kixtupu', 'kiltupu', 'kixtsupu', 'kiltsupu'],
    ['kipu', 'kipppu'],
  ],
  ['ちょっと', 'chotto', 6, ['chotto', 'tyotto', 'choxtuto', 'tyoltsuto'], ['chyotto', 'choto']],
  [
    'まっちゃ',
    'matcha',
    6,
    ['matcha', 'maccha', 'mattya', 'maxtucha', 'maltutya'],
    ['matya', 'macha'],
  ],
  ['あっ', 'axtu', 4, ['axtu', 'altu', 'axtsu', 'altsu'], ['a', 'att', 'atu']],
  ['らーめん', 'ra-menn', 7, ['ra-menn', "ra-men'", 'ra-mexn'], ['ra-men', 'ramenn']],
  ['しゃしん', 'shashinn', 7, ['shashinn', 'syasinn', 'shasinn'], ['shashin', 'shyashinn']],
  ['かんい', 'kanni', 5, ['kanni', "kan'i", 'kaxni'], ['kani', 'kanii']],
  ['かんや', 'kannya', 6, ['kannya', "kan'ya"], ['kanya']],
  ['おんがく', 'ongaku', 6, ['ongaku', 'onngaku', "on'gaku"], ['onngakuu']],
  ['ううん', 'uunn', 4, ['uunn', "uun'"], ['uun']],
  ['ふじさん', 'fujisann', 8, ['fujisann', 'hujisann', 'fuzisann', 'huzisann'], ['fujisan']],
  ['じゃんぷ', 'janpu', 5, ['janpu', 'jyanpu', 'zyanpu', 'jannpu'], ['janppu']],
  ['ウェブ', 'webu', 4, ['webu', 'whebu'], ['uxebu']],
  ['ファイル', 'fairu', 5, ['fairu'], ['huairu']],
];

describe('what is shown and what is accepted', () => {
  it.each(FIXTURES)(
    '%s is shown as %s, in %i keys at the least',
    (text, shown, canonical, accepted, refused) => {
      const program = compile(line(text));
      expect(render(program.atoms)).toBe(shown);
      expect(program.canonicalKeystrokes).toBe(canonical);
      for (const typed of accepted) expect(accepts(program.atoms, typed), typed).toBe(true);
      for (const typed of refused) expect(accepts(program.atoms, typed), typed).toBe(false);
    },
  );

  it("spells ん as nn, n' or xn, and as a bare n only before a key that cannot continue it", () => {
    expect(spellingsOf('かんか')[1]).toEqual(['n', 'nn', "n'", 'xn']);
    expect(spellingsOf('かんい')[1]).toEqual(['nn', "n'", 'xn']);
    expect(spellingsOf('かんな')[1]).toEqual(['nn', "n'", 'xn']);
    expect(spellingsOf('かんや')[1]).toEqual(['nn', "n'", 'xn']);
    expect(spellingsOf('かんん')[1]).toEqual(['nn', "n'", 'xn']);
    expect(spellingsOf('かん')[1]).toEqual(['nn', "n'", 'xn']);
    expect(spellingsOf('かんー')[1]).toEqual(['n', 'nn', "n'", 'xn']);
    expect(spellingsOf('かんっか')[1]).toEqual(['n', 'nn', "n'", 'xn']);
  });

  it('spells a sokuon by doubling the next consonant or with a small tsu, and never doubles a vowel or n', () => {
    expect(spellingsOf('かっか')[1]).toEqual(['kka', 'xtuka', 'ltuka', 'xtsuka', 'ltsuka']);
    expect(spellingsOf('かっし')[1]).toEqual([
      'sshi',
      'ssi',
      'xtushi',
      'xtusi',
      'ltushi',
      'ltusi',
      'xtsushi',
      'xtsusi',
      'ltsushi',
      'ltsusi',
    ]);
    expect(spellingsOf('かっち')[1]?.slice(0, 4)).toEqual(['tchi', 'cchi', 'tti', 'xtuchi']);
    expect(spellingsOf('かっあ')[1]).toEqual(['xtua', 'ltua', 'xtsua', 'ltsua']);
    expect(spellingsOf('かっな')[1]).toEqual(['xtuna', 'ltuna', 'xtsuna', 'ltsuna']);
    expect(spellingsOf('かっや')[1]?.[0]).toBe('yya');
  });

  it('joins a sokuon with the kana after it into one unit, and leaves a lone one at the end of a line', () => {
    const program = compile(line('いっぽん'));
    expect(program.atoms.map((atom) => (atom.kind === 'romaji' ? atom.display : '\n'))).toEqual([
      'い',
      'っぽ',
      'ん',
    ]);
    expect(spellingsOf('あっ')[1]).toEqual(['xtu', 'ltu', 'xtsu', 'ltsu']);
  });

  it('treats katakana as hiragana, showing the katakana', () => {
    const program = compile(line('ラーメン'));
    expect(render(program.atoms)).toBe('ra-menn');
    expect(program.atoms.map((atom) => (atom.kind === 'romaji' ? atom.display : ''))).toEqual([
      'ラ',
      'ー',
      'メ',
      'ン',
    ]);
  });

  it('maps ー、。 to - , .', () => {
    expect(shown(line('あー、い。'))).toBe('a-,i.');
  });
});

describe('the text shown above the units', () => {
  const kanji: JapaneseSegment[] = [
    { display: '今日', reading: 'きょう' },
    { display: 'は', reading: 'は' },
    { display: '、', reading: '、' },
    { display: '晴', reading: 'は' },
    { display: 'れ', reading: 'れ' },
    { display: '。', reading: '。' },
  ];
  const displays = (program: TypingProgram) =>
    program.atoms.map((atom) => (atom.kind === 'romaji' ? atom.display : '\n'));

  it('puts a kanji on the unit its reading starts in, and nothing on the units that continue it', () => {
    const program = compile(kanji);
    expect(render(program.atoms)).toBe('kyouha,hare.');
    expect(displays(program)).toEqual(['今日', '', 'は', '、', '晴', 'れ', '。']);
  });

  it('puts a kanji on the unit that holds the start of its reading, even when a sokuon reaches into it', () => {
    const program = compile([
      { display: '一', reading: 'いっ' },
      { display: '本', reading: 'ぽん' },
    ]);
    expect(displays(program)).toEqual(['一', '本', '']);
  });

  it('joins the texts of segments that start in one unit', () => {
    const program = compile([
      { display: 'X', reading: 'っ' },
      { display: 'Y', reading: 'か' },
    ]);
    expect(displays(program)).toEqual(['XY']);
  });

  it('shows kana as themselves, a combination on one unit', () => {
    expect(displays(compile(line('しゃっ')))).toEqual(['しゃ', 'っ']);
  });
});

describe('lines and the program', () => {
  it('joins lines with a required Enter, and counts it', () => {
    const program = compile(line('あ'), line('い'));
    expect(program.atoms.map((atom) => atom.kind)).toEqual(['romaji', 'separator', 'romaji']);
    expect(program.atoms[1]).toEqual({ kind: 'separator', canonical: '\n', required: true });
    expect(program.canonicalKeystrokes).toBe(3);
    expect(accepts(program.atoms, 'a\ni')).toBe(true);
    expect(accepts(program.atoms, 'ai')).toBe(false);
  });

  it('ends a line on ん with nn, not n, even before a line break', () => {
    const program = compile(line('あん'), line('い'));
    expect(accepts(program.atoms, 'ann\ni')).toBe(true);
    expect(accepts(program.atoms, 'an\ni')).toBe(false);
  });

  it('keeps the block id and passes the schema of a Japanese content bundle', () => {
    const program = compileJapanese('ja-paragraph/0001', [
      line('こんにちは、'),
      line('さようなら。'),
    ]);
    expect(program.blockId).toBe('ja-paragraph/0001');
    const bundle = {
      schemaVersion: 1,
      language: 'ja-paragraph',
      revision: 'a'.repeat(64),
      blocks: [program],
    };
    expect(ContentBundleSchema.safeParse(bundle).success).toBe(true);
  });
});

describe('text that cannot be typed', () => {
  const errorOf = (...lines: JapaneseSegment[][]) => {
    try {
      compile(...lines);
    } catch (error) {
      if (!(error instanceof JapaneseCompileError)) throw error;
      return { code: error.code, line: error.line, column: error.column, message: error.message };
    }
    throw new Error('expected a JapaneseCompileError');
  };

  it.each([
    ['a lone small kana', 'あゃ', 1],
    ['a small vowel with nothing to combine with', 'かぁ', 1],
    ['ゐ', 'ゐ', 0],
    ['ヴ', 'あヴ', 1],
    ['ヶ', 'ヶ', 0],
  ])('refuses %s as unsupported-kana', (_description, text, column) => {
    expect(errorOf(line(text))).toMatchObject({ code: 'unsupported-kana', line: 0, column });
  });

  it.each([['っん'], ['っっか'], ['っー'], ['っ、'], ['かっ。']])(
    'refuses %s as unsupported-sequence',
    (text) => {
      expect(errorOf(line(text)).code).toBe('unsupported-sequence');
    },
  );

  it('reports the line and position of a fault, one-based in the message', () => {
    const error = errorOf(line('あい'), line('うゐ'));
    expect(error).toMatchObject({ code: 'unsupported-kana', line: 1, column: 1 });
    expect(error.message).toContain('line 2, reading position 2');
  });

  it('refuses a reading that is not kana, and a line with nothing to type', () => {
    expect(errorOf([{ display: '今', reading: '今' }])).toMatchObject({ code: 'reading-not-kana' });
    expect(errorOf([{ display: 'a', reading: 'a' }])).toMatchObject({ code: 'reading-not-kana' });
    expect(errorOf([])).toMatchObject({ code: 'empty-line' });
    expect(errorOf(line('あ'), [{ display: '', reading: '' }])).toMatchObject({
      code: 'empty-line',
      line: 1,
    });
  });
});

describe('the kana table', () => {
  it('holds only lowercase romaji, with the shown spelling first and no spelling twice', () => {
    for (const [kana, spellings] of KANA_TABLE) {
      expect(spellings.length, kana).toBeGreaterThan(0);
      expect(new Set(spellings).size, kana).toBe(spellings.length);
      for (const spelling of spellings) expect(spelling, kana).toMatch(/^[a-z]+$/);
    }
  });

  it('never lets one spelling of a kana be the start of another of the same kana', () => {
    for (const [kana, spellings] of KANA_TABLE) {
      for (const a of spellings) {
        for (const b of spellings) {
          if (a !== b) expect(b.startsWith(a), `${kana}: ${a} / ${b}`).toBe(false);
        }
      }
    }
  });

  it('spells the special kana as agreed, Hepburn first', () => {
    const spelled = (kana: string) => KANA_TABLE.get(kana);
    expect(spelled('し')).toEqual(['shi', 'si']);
    expect(spelled('ち')).toEqual(['chi', 'ti']);
    expect(spelled('つ')).toEqual(['tsu', 'tu']);
    expect(spelled('ふ')).toEqual(['fu', 'hu']);
    expect(spelled('じ')).toEqual(['ji', 'zi']);
    expect(spelled('ぢ')).toEqual(['di']);
    expect(spelled('づ')).toEqual(['du']);
    expect(spelled('を')).toEqual(['wo']);
    expect(spelled('しゃ')).toEqual(['sha', 'sya']);
    expect(spelled('じゅ')).toEqual(['ju', 'jyu', 'zyu']);
    expect(spelled('ちょ')).toEqual(['cho', 'tyo']);
    expect(spelled('しぇ')).toEqual(['she', 'sye']);
    expect(spelled('じぇ')).toEqual(['je', 'jye', 'zye']);
    expect(spelled('ふぁ')).toEqual(['fa']);
    expect(spelled('うぃ')).toEqual(['wi']);
    expect(spelled('うぇ')).toEqual(['we', 'whe']);
    expect(spelled('うぉ')).toEqual(['who']);
    expect(spelled('てぃ')).toEqual(['thi']);
    expect(spelled('でぃ')).toEqual(['dhi']);
  });

  it('has every combination of the twelve consonant kana with ゃ ゅ ょ, and the whole gojuon', () => {
    for (const kana of 'きぎしじちぢにひびぴみり') {
      for (const small of 'ゃゅょ') expect(KANA_TABLE.has(kana + small), kana + small).toBe(true);
    }
    const gojuon =
      'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわを';
    for (const kana of gojuon) expect(KANA_TABLE.has(kana), kana).toBe(true);
    for (const kana of 'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ') {
      expect(KANA_TABLE.has(kana), kana).toBe(true);
    }
  });
});
