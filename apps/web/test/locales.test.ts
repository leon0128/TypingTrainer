import { describe, expect, it } from 'vitest';

import en from '../src/i18n/locales/en.json';
import ja from '../src/i18n/locales/ja.json';

interface Resource {
  [key: string]: string | Resource;
}

const LANGUAGES = { en: en as Resource, ja: ja as Resource };

/** Every leaf, as `dotted.path` → text. */
function leaves(resource: Resource, prefix = ''): Map<string, string> {
  const found = new Map<string, string>();
  for (const [key, value] of Object.entries(resource)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof value === 'string') found.set(path, value);
    else for (const [inner, text] of leaves(value, path)) found.set(inner, text);
  }
  return found;
}

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** The keys as a translator sees them: one entry per message, however many plural forms it has. */
function messages(resource: Resource): Map<string, Map<string, string>> {
  const grouped = new Map<string, Map<string, string>>();
  for (const [path, text] of leaves(resource)) {
    const suffix = PLURAL_SUFFIX.exec(path)?.[1] ?? '';
    const base = path.replace(PLURAL_SUFFIX, '');
    const forms = grouped.get(base) ?? new Map<string, string>();
    forms.set(suffix, text);
    grouped.set(base, forms);
  }
  return grouped;
}

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? '').sort();

/**
 * Text that is the same in every language: names, and nothing that a person would read as English.
 * A key belongs here only if translating it would be wrong; the list is short on purpose.
 */
const SAME_IN_EVERY_LANGUAGE = new Set<string>([
  // The product's name.
  'app.name',
  // Each language's name for itself, so it can be found whichever language is showing.
  'languageNames.en',
  'languageNames.ja',
  // A name and an abbreviation that are written the same way in Japanese, and formats that are
  // only a number and a unit symbol.
  'modes.cpu',
  'opponent.cpu',
  'play.versus',
  'result.kpm',
  'common.percent',
  'common.milliseconds',
  'rankings.rank',
  'rankings.kpm',
  'history.kpm',
  'settings.sizeValue',
  'settings.presets.okabe-ito',
  // "30%": a number and a symbol, which Japanese writes the same way.
  'settings.volumeText',
  // Arcade-style labels kept in Latin capitals in both languages.
  'play.left',
  'play.you',
  'play.opponentGroup',
  'play.nextBlock',
  'play.opponentScore',
  'result.score',
  'result.won',
  'result.lost',
]);

describe('the language resources (§8.4)', () => {
  const english = messages(LANGUAGES.en);

  it('are not empty', () => {
    expect(english.size).toBeGreaterThan(20);
  });

  describe.each(['ja'] as const)('%s', (language) => {
    const translated = messages(LANGUAGES[language]);

    it('has exactly the messages English has, no more and no fewer', () => {
      expect([...translated.keys()].sort()).toEqual([...english.keys()].sort());
    });

    it('has the plural forms its language needs, and only those', () => {
      const needed = new Set(new Intl.PluralRules(language).resolvedOptions().pluralCategories);
      for (const [message, forms] of translated) {
        const given = [...forms.keys()].filter((form) => form !== '');
        // A message with no count has one plain form; one with plural forms has the language's own.
        if (given.length > 0) {
          expect(new Set(given), message).toEqual(needed);
        } else {
          expect(forms.has(''), message).toBe(true);
        }
      }
    });

    it('uses the same placeholders as English in every message', () => {
      for (const [message, forms] of translated) {
        const englishForms = english.get(message);
        const englishPlaceholders = new Set(
          [...(englishForms?.values() ?? [])].flatMap((text) => placeholders(text)),
        );
        for (const text of forms.values()) {
          expect(new Set(placeholders(text)), `${message}: ${text}`).toEqual(englishPlaceholders);
        }
      }
    });

    it('has no empty text and no untranslated English', () => {
      for (const [path, text] of leaves(LANGUAGES[language])) {
        expect(text.trim(), path).not.toBe('');
        if (SAME_IN_EVERY_LANGUAGE.has(path.replace(PLURAL_SUFFIX, ''))) continue;
        // Japanese text contains Japanese: kana or kanji, not only Latin letters.
        expect(text, path).toMatch(/[぀-ヿ一-鿿]/);
        expect(text, path).not.toBe(leaves(LANGUAGES.en).get(path));
      }
    });
  });

  it('are valid to interpolate: every placeholder is a plain word', () => {
    for (const [, text] of leaves(LANGUAGES.en)) {
      const open = (text.match(/\{\{/g) ?? []).length;
      expect(placeholders(text)).toHaveLength(open);
    }
  });
});
