import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { ContentBundleSchema } from '@typing-trainer/contracts';
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';

import {
  JOYO_KANJI,
  READINGS_FILE,
  bundleDiagnostics,
  isAllowedKanji,
  naturalBlockId,
  parsePoolFile,
  parseRuby,
  poolSourcePath,
  runPipeline,
  writeBundles,
  type ContentDiagnostic,
} from '../src';

const roots: string[] = [];

/** A temporary repository root with the given files under `content/natural/`. */
function repository(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'content-cli-natural-'));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    const full = join(root, 'content', 'natural', path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** `stage/code line:column` of every diagnostic. */
const where = (diagnostics: readonly ContentDiagnostic[]) =>
  diagnostics.map((d) => `${d.stage}/${d.code} ${String(d.line)}:${String(d.column)}`);

const run = async (files: Record<string, string>) => runPipeline({ root: repository(files) });

describe('the jōyō kanji table', () => {
  it('has 2136 distinct kanji', () => {
    expect(JOYO_KANJI.size).toBe(2136);
  });

  it('has the 196 kanji added in 2010, and not the five it removed', () => {
    for (const added of Array.from(
      '挨曖宛嵐畏萎椅彙茨咽淫唄鬱怨媛艶臆崖概蓋骸柿顎葛釜鎌韓玩伎亀毀畿臼嗅巾僅',
    )) {
      expect(JOYO_KANJI.has(added), added).toBe(true);
    }
    for (const removed of Array.from('勺錘銑脹匁'))
      expect(JOYO_KANJI.has(removed), removed).toBe(false);
  });

  it('holds everyday kanji, and lacks rare ones', () => {
    for (const common of Array.from('日本語学校漢字今晴人生'))
      expect(JOYO_KANJI.has(common)).toBe(true);
    for (const rare of Array.from('薔薇鬮龍')) expect(JOYO_KANJI.has(rare), rare).toBe(false);
  });

  it('also allows the usual shapes of the four the table lists differently, and 々', () => {
    for (const character of Array.from('叱填剥頬々')) expect(isAllowedKanji(character)).toBe(true);
    expect(isAllowedKanji('薔')).toBe(false);
    expect(isAllowedKanji('あ')).toBe(false);
  });
});

describe('a pool file', () => {
  const parse = (text: string, kind: 'word' | 'line' | 'paragraph') =>
    parsePoolFile(text, kind, 'content/natural/en/x.txt');

  it('has a block on every line for words and sentences, skipping blanks and comments', () => {
    const { blocks, diagnostics } = parse('# a comment\napple\n\nbanana\n', 'word');
    expect(diagnostics).toEqual([]);
    expect(blocks.map((block) => block.lines.map((line) => [line.text, line.number]))).toEqual([
      [['apple', 2]],
      [['banana', 4]],
    ]);
  });

  it('has a block for every run of lines in a paragraph file, and a comment does not end one', () => {
    const { blocks } = parse('a one\n# note\na two\n\nb one\nb two\nb three\n', 'paragraph');
    expect(blocks.map((block) => block.lines.map((line) => line.text))).toEqual([
      ['a one', 'a two'],
      ['b one', 'b two', 'b three'],
    ]);
  });

  it('reports tabs, whitespace at the ends of a line, spaces on a blank line, and carriage returns', () => {
    const { diagnostics } = parse('a\tb\n c\nd \n \nfoo\r\nbar\n', 'line');
    expect(where(diagnostics)).toEqual([
      'discover/tab 1:2',
      'discover/whitespace 2:1',
      'discover/whitespace 3:1',
      'discover/whitespace 4:1',
      'discover/carriage-return 5:4',
    ]);
  });
});

describe('readings in brackets', () => {
  const columns = (line: string) =>
    parseRuby(line).segments.map((s) => [s.display, s.reading, s.column]);

  it('gives a reading to the run of kanji before it, and every other character its own', () => {
    expect(columns('今日[きょう]は晴[は]れ')).toEqual([
      ['今日', 'きょう', 1],
      ['は', 'は', 8],
      ['晴', 'は', 9],
      ['れ', 'れ', 13],
    ]);
    expect(parseRuby('今日[きょう]は晴[は]れ').errors).toEqual([]);
  });

  it('keeps 々 in the kanji it follows, and takes katakana and ー as a reading', () => {
    expect(columns('人々[ひとびと]')).toEqual([['人々', 'ひとびと', 1]]);
    expect(columns('会[カイ]社[しゃ]')).toEqual([
      ['会', 'カイ', 1],
      ['社', 'しゃ', 6],
    ]);
    expect(parseRuby('駅[えき]ー').errors).toEqual([]);
  });

  it.each([
    ['今日', 'missing-reading', 1],
    ['今日はうれしい', 'missing-reading', 1],
    ['あ晴れ', 'missing-reading', 2],
    ['今日[]', 'empty-reading', 3],
    ['[きょう]', 'missing-base', 1],
    ['あ[い]', 'missing-base', 2],
    ['今日[きょう', 'unclosed-bracket', 3],
    ['今日[きょう]]', 'unmatched-bracket', 8],
    ['今日[きょ[う]]', 'nested-bracket', 6],
    ['今日[kyou]', 'reading-not-kana', 4],
    ['今日[今日]', 'reading-not-kana', 4],
  ])('reports %s as %s at column %i', (line, code, column) => {
    const { errors } = parseRuby(line);
    expect(errors[0], JSON.stringify(errors)).toMatchObject({ code, column });
  });

  it('reads back what was written, whatever the segments (property)', () => {
    const kanji = fc.constantFrom(...Array.from('今日晴学校人生'));
    const kana = fc.constantFrom(...Array.from('あいうえおかきくけこーカキ'));
    const withReading = fc
      .tuple(
        fc.array(kanji, { minLength: 1, maxLength: 3 }),
        fc.array(kana, { minLength: 1, maxLength: 4 }),
      )
      .map(([base, reading]) => ({ display: base.join(''), reading: reading.join('') }));
    const plain = fc
      .constantFrom(...Array.from('あいうかきくけこ、。'))
      .map((c) => ({ display: c, reading: c }));
    fc.assert(
      fc.property(
        fc.array(fc.oneof(withReading, plain), { minLength: 1, maxLength: 8 }),
        (segments) => {
          const text = segments
            .map((s) => (s.display === s.reading ? s.display : `${s.display}[${s.reading}]`))
            .join('');
          const parsed = parseRuby(text);
          expect(parsed.errors).toEqual([]);
          expect(parsed.segments.map(({ display, reading }) => ({ display, reading }))).toEqual(
            segments,
          );
          const columnsOfSegments = parsed.segments.map((s) => s.column);
          expect([...columnsOfSegments].sort((a, b) => a - b)).toEqual(columnsOfSegments);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('English pools', () => {
  it('builds a bundle for each pool, with block ids from the text and programs that are the text', async () => {
    const result = await run({
      'en/word.txt': 'apple\nbanana\n',
      'en/line.txt': 'The cat sat on the mat\nI like reading books at night\n',
      'en/paragraph.txt':
        'Hello there, my friend.\nHow are you today.\n\nIt is late.\nGo to bed now.\n',
    });
    expect(result.diagnostics).toEqual([]);
    expect([...result.bundles.keys()]).toEqual(['en-word', 'en-line', 'en-paragraph']);
    const words = result.bundles.get('en-word')?.bundle;
    expect(ContentBundleSchema.safeParse(words).success).toBe(true);
    expect(words?.blocks.map((block) => block.blockId).sort()).toEqual(
      [naturalBlockId('en-word', 'apple'), naturalBlockId('en-word', 'banana')].sort(),
    );
  });

  it('takes a paragraph as literals, required spaces, and a required Enter', async () => {
    const { bundles } = await run({ 'en/paragraph.txt': 'It is late.\nGo to bed now.\n' });
    const block = bundles.get('en-paragraph')?.bundle.blocks[0];
    expect(
      block?.atoms.map((atom) =>
        atom.kind === 'literal'
          ? atom.text
          : atom.kind === 'separator'
            ? `${JSON.stringify(atom.canonical)}${atom.required ? '!' : '?'}`
            : '',
      ),
    ).toEqual([
      'It',
      '" "!',
      'is',
      '" "!',
      'late.',
      '"\\n"!',
      'Go',
      '" "!',
      'to',
      '" "!',
      'bed',
      '" "!',
      'now.',
    ]);
    expect(block?.canonicalKeystrokes).toBe('It is late.'.length + 1 + 'Go to bed now.'.length);
  });

  it.each([
    ['en/word.txt', 'ab1\n', ['constraints/character 1:3']],
    ['en/word.txt', 'a\n', ['constraints/word-shape 1:1']],
    ['en/word.txt', 'abcdefghijklmnopq\n', ['constraints/word-shape 1:1']],
    ['en/word.txt', 'hello world\n', ['constraints/character 1:6']],
    ['en/word.txt', "don't\n", ['constraints/character 1:4']],
    ['en/line.txt', 'Hello, world today friends\n', ['constraints/punctuation 1:6']],
    ['en/line.txt', 'Hello world today friends.\n', ['constraints/punctuation 1:26']],
    ['en/line.txt', 'Two words\n', ['constraints/word-count 1:1']],
    ['en/line.txt', 'double  space here now\n', ['constraints/spacing 1:7']],
    ['en/line.txt', 'It is 5 days now\n', ['constraints/character 1:7']],
    ['en/line.txt', 'Well - well - well\n', ['constraints/word-shape 1:1']],
    [
      'en/line.txt',
      `${Array.from({ length: 15 }, () => 'abcdefg').join(' ')}\n`,
      ['constraints/line-width 1:89'],
    ],
    ['en/paragraph.txt', 'Only one line here.\n', ['constraints/line-count 1:1']],
    ['en/paragraph.txt', 'No stops here\nAt all here\n', ['constraints/no-punctuation 1:1']],
    ['en/paragraph.txt', 'Great, that is\nthe end\n', []],
    ['en/paragraph.txt', 'Wait? Really\nyes yes yes.\n', ['constraints/character 1:5']],
  ])('checks %s "%s"', async (file, text, expected) => {
    const { diagnostics } = await run({ [file]: text });
    expect(where(diagnostics)).toEqual(expected);
  });

  it('refuses a paragraph of eleven lines', async () => {
    const lines = Array.from({ length: 11 }, (_, index) => `Line number ${'x'.repeat(index + 1)}.`);
    const { diagnostics } = await run({ 'en/paragraph.txt': `${lines.join('\n')}\n` });
    expect(where(diagnostics)).toEqual(['constraints/line-count 1:1']);
  });

  it('builds nothing for a pool with a diagnostic, and reports the others', async () => {
    const result = await run({
      'en/word.txt': 'apple\nbad1\n',
      'en/line.txt': 'The cat sat on the mat\n',
    });
    expect([...result.bundles.keys()]).toEqual(['en-line']);
    expect(where(result.diagnostics)).toEqual(['constraints/character 2:4']);
  });
});

describe('duplicates', () => {
  it('reports a repeated word, whatever its case', async () => {
    const { diagnostics } = await run({ 'en/word.txt': 'apple\nbanana\nApple\n' });
    expect(where(diagnostics)).toEqual(['dedupe/duplicate 3:1']);
    expect(diagnostics[0]?.message).toBe('identical to line 1');
  });

  it('reports sentences that share nearly every three words, and not ones that merely share a start', async () => {
    const base = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen';
    const near = await run({ 'en/line.txt': `${base} fifteen\n${base} sixteen\n` });
    expect(where(near.diagnostics)).toEqual(['dedupe/similar 2:1']);
    const apart = await run({
      'en/line.txt': 'The cat sat on the mat today\nThe dog ran in the park today\n',
    });
    expect(apart.diagnostics).toEqual([]);
  });

  it('does not compare a word with the others but for equality', async () => {
    const { diagnostics } = await run({ 'en/word.txt': 'apples\napple\napplet\n' });
    expect(diagnostics).toEqual([]);
  });
});

describe('Japanese pools', () => {
  it('builds a bundle whose units are the readings, and lists every kanji word with its reading', async () => {
    const result = await run({
      'ja/word.txt': '学校[がっこう]\nねこ\nコーヒー\n今日[きょう]\n',
      'ja/line.txt': '今日[きょう]は晴[は]れです\n',
    });
    expect(result.diagnostics).toEqual([]);
    const school = result.bundles
      .get('ja-word')
      ?.bundle.blocks.find(
        (block) => block.blockId === naturalBlockId('ja-word', '学校[がっこう]'),
      );
    expect(
      school?.atoms.map((atom) =>
        atom.kind === 'romaji' ? [atom.display, atom.alternatives[0]] : '\n',
      ),
    ).toEqual([
      ['学校', 'ga'],
      ['', 'kko'],
      ['', 'u'],
    ]);
    expect(result.files.get(READINGS_FILE)).toBe(
      [
        '# Every kanji word of the Japanese pools with the reading it is given, one pair a line, sorted.',
        '# Generated by pnpm content:build; review the pairs a change adds, and do not edit this file.',
        '今日\tきょう',
        '学校\tがっこう',
        '晴\tは',
        '',
      ].join('\n'),
    );
  });

  it.each([
    ['ja/word.txt', '学校\n', ['parse/missing-reading 1:1']],
    ['ja/word.txt', '学校[]\n', ['parse/empty-reading 1:3']],
    ['ja/word.txt', '[がっこう]\n', ['parse/missing-base 1:1']],
    ['ja/word.txt', '学校[がっこう\n', ['parse/unclosed-bracket 1:3']],
    ['ja/word.txt', '学校[がっこう]]\n', ['parse/unmatched-bracket 1:9']],
    [
      'ja/word.txt',
      '薔薇[ばら]\n',
      ['constraints/kanji-not-joyo 1:1', 'constraints/kanji-not-joyo 1:2'],
    ],
    [
      'ja/word.txt',
      'ab\n',
      ['constraints/character 1:1', 'constraints/character 1:2', 'constraints/word-shape 1:1'],
    ],
    ['ja/word.txt', 'あ\n', ['constraints/word-shape 1:1']],
    ['ja/word.txt', 'あいうえおかきくけこさしす\n', ['constraints/word-shape 1:1']],
    ['ja/word.txt', 'あい、\n', ['constraints/punctuation 1:3']],
    ['ja/line.txt', 'あいうえお\n', ['constraints/word-shape 1:1']],
    ['ja/line.txt', 'あいうえおかき。\n', ['constraints/punctuation 1:8']],
    ['ja/word.txt', 'ゐゐ\n', ['compile/unsupported-kana 1:1']],
    ['ja/word.txt', 'ああっんあ\n', ['compile/unsupported-sequence 1:3']],
    ['ja/word.txt', 'ぬぬ！\n', ['constraints/character 1:3']],
    ['ja/paragraph.txt', 'こんにちは\nさようなら\n', ['constraints/no-punctuation 1:1']],
    ['ja/paragraph.txt', 'こんにちは、さようなら。\n', ['constraints/line-count 1:1']],
  ])('checks %s "%s"', async (file, text, expected) => {
    const { diagnostics } = await run({ [file]: text });
    expect(where(diagnostics)).toEqual(expected);
  });

  it('accepts 叱, 々, katakana, and the marks in a paragraph', async () => {
    const result = await run({
      'ja/word.txt': '叱[しか]る\n人々[ひとびと]\nコーヒー\n',
      'ja/paragraph.txt': 'こんにちは、世界[せかい]。\nさようなら。\n',
    });
    expect(result.diagnostics).toEqual([]);
    expect([...result.bundles.keys()]).toEqual(['ja-word', 'ja-paragraph']);
  });

  it('reports the width of the text and of its romaji separately', async () => {
    const wide = await run({ 'ja/line.txt': `${'あ'.repeat(45)}\n` });
    expect(where(wide.diagnostics)).toEqual(['constraints/line-width 1:1']);
    // 44 characters is 88 columns of text, and tsu is spelled with three keys.
    const romaji = await run({ 'ja/line.txt': `${'つ'.repeat(44)}\n` });
    expect(where(romaji.diagnostics)).toEqual(['constraints/line-width 1:1']);
    expect(romaji.diagnostics[0]?.message).toContain('romaji');
    const fits = await run({ 'ja/line.txt': `${'あ'.repeat(44)}\n` });
    expect(fits.diagnostics).toEqual([]);
  });

  it('reports the same text twice as a duplicate, and gives no readings file while a pool is wrong', async () => {
    const result = await run({
      'ja/word.txt': '学校[がっこう]\nねこ\n学校[がっこう]\nabc\n',
    });
    expect(where(result.diagnostics)).toContain('dedupe/duplicate 3:1');
    expect(result.files.size).toBe(0);
  });

  it('maps a compile error to the segment where it is', async () => {
    const { diagnostics } = await run({ 'ja/word.txt': '学校[がっこう]ゐ\n' });
    expect(where(diagnostics)).toEqual(['compile/unsupported-kana 1:9']);
  });
});

describe('ids and the bundle', () => {
  it('does not change when blocks move, and changes only for the block that changes', async () => {
    const a = await run({ 'en/word.txt': 'apple\nbanana\ncherry\n' });
    const b = await run({ 'en/word.txt': 'cherry\napple\nbanana\n' });
    expect(a.bundles.get('en-word')?.text).toBe(b.bundles.get('en-word')?.text);
    const c = await run({ 'en/word.txt': 'apple\nbanana\ncherries\n' });
    const ids = (r: typeof a) =>
      r.bundles.get('en-word')?.bundle.blocks.map((block) => block.blockId) ?? [];
    expect(ids(c).filter((id) => ids(a).includes(id))).toHaveLength(2);
    expect(c.bundles.get('en-word')?.bundle.revision).not.toBe(
      a.bundles.get('en-word')?.bundle.revision,
    );
  });

  it('names a block by its pool and the hash of its text', () => {
    expect(naturalBlockId('ja-line', 'x')).toMatch(/^ja-line\/[0-9a-f]{8}$/);
    expect(naturalBlockId('ja-line', 'x')).toBe(naturalBlockId('ja-line', 'x'));
    expect(naturalBlockId('ja-line', 'x')).not.toBe(naturalBlockId('ja-word', 'x'));
  });

  it('is the same on every run', async () => {
    const files = { 'ja/word.txt': '学校[がっこう]\nねこ\n', 'en/word.txt': 'apple\nbanana\n' };
    const first = await run(files);
    const second = await run(files);
    for (const [pool, built] of first.bundles)
      expect(second.bundles.get(pool)?.text).toBe(built.text);
    expect(second.files).toEqual(first.files);
  });
});

describe('what is in content/natural', () => {
  it('reports files and directories that are not part of it', async () => {
    const { diagnostics } = await run({
      'en/words.txt': 'apple\n',
      'fr/word.txt': 'pomme\n',
      'ja/notes.txt': 'x\n',
      'stray.txt': 'x\n',
      'AUTHORING_NOTES.md': 'ok\n',
    });
    expect(diagnostics.map((d) => `${d.file} ${d.stage}/${d.code}`)).toEqual([
      'content/natural/en/words.txt discover/file-name',
      'content/natural/fr discover/file-name',
      'content/natural/ja/notes.txt discover/file-name',
      'content/natural/stray.txt discover/file-name',
    ]);
  });

  it('needs no content/natural at all', async () => {
    const root = mkdtempSync(join(tmpdir(), 'content-cli-none-'));
    roots.push(root);
    const result = await runPipeline({ root });
    expect(result.diagnostics).toEqual([]);
    expect(result.bundles.size).toBe(0);
    expect(result.files.size).toBe(0);
  });

  it('finds the file of each pool', () => {
    expect(poolSourcePath('en-word')).toBe('content/natural/en/word.txt');
    expect(poolSourcePath('ja-paragraph')).toBe('content/natural/ja/paragraph.txt');
  });
});

describe('build and check', () => {
  const FILES = {
    'en/word.txt': 'apple\nbanana\n',
    'ja/word.txt': '学校[がっこう]\nねこ\n',
  };

  it('writes the bundles and the readings, and then finds nothing stale', async () => {
    const root = repository(FILES);
    const result = await runPipeline({ root });
    const written = writeBundles(root, result);
    expect(written).toEqual([
      'content/dist/ja-word.bundle.json',
      'content/dist/en-word.bundle.json',
      READINGS_FILE,
    ]);
    expect(bundleDiagnostics(root, result)).toEqual([]);
    expect(readFileSync(join(root, READINGS_FILE), 'utf8')).toContain('学校\tがっこう');
  });

  it('finds a bundle or the readings out of date, missing, or left over', async () => {
    const root = repository(FILES);
    const result = await runPipeline({ root });
    writeBundles(root, result);

    writeFileSync(join(root, 'content/dist/en-word.bundle.json'), '{}\n');
    writeFileSync(join(root, READINGS_FILE), '# stale\n');
    rmSync(join(root, 'content/dist/ja-word.bundle.json'));
    expect(bundleDiagnostics(root, result).map((d) => `${d.file} ${d.code}`)).toEqual([
      'content/dist/ja-word.bundle.json missing',
      'content/dist/en-word.bundle.json stale',
      `${READINGS_FILE} stale`,
    ]);

    // With no kanji left there is nothing to generate the readings from.
    writeFileSync(join(root, 'content/natural/ja/word.txt'), 'ねこ\nいぬ\n');
    const kana = await runPipeline({ root });
    expect(existsSync(join(root, READINGS_FILE))).toBe(true);
    expect(bundleDiagnostics(root, kana).map((d) => `${d.file} ${d.code}`)).toContain(
      `${READINGS_FILE} unexpected`,
    );
    writeBundles(root, kana);
    expect(existsSync(join(root, READINGS_FILE))).toBe(false);
  });
});
