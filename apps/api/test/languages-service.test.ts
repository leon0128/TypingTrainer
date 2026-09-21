import { describe, expect, it } from 'vitest';

import type { Language } from '../src/entities';
import { LanguagesService } from '../src/modules/languages/languages.service';

const allBundles = { has: () => true };
const english = { locale: 'en' };
const japanese = { locale: 'ja' };

const row = (slug: string, displayName: string): Language =>
  Object.assign(Object.create(null) as Language, { slug, displayName });

describe('LanguagesService.list', () => {
  it('maps enabled rows to contract languages in the order the repository returns', async () => {
    const service = new LanguagesService(
      { findEnabled: () => Promise.resolve([row('go', 'Go'), row('python', 'Python')]) },
      allBundles,
    );
    expect(await service.list(english)).toEqual({
      languages: [
        { slug: 'go', displayName: 'Go', track: 'code', kind: null },
        { slug: 'python', displayName: 'Python', track: 'code', kind: null },
      ],
    });
  });

  it('omits a row whose slug is not a content language instead of failing the list', async () => {
    const service = new LanguagesService(
      { findEnabled: () => Promise.resolve([row('rust', 'Rust'), row('java', 'Java')]) },
      allBundles,
    );
    expect(await service.list(english)).toEqual({
      languages: [{ slug: 'java', displayName: 'Java', track: 'code', kind: null }],
    });
  });

  it('omits an enabled language whose content bundle is not loaded', async () => {
    const service = new LanguagesService(
      { findEnabled: () => Promise.resolve([row('go', 'Go'), row('java', 'Java')]) },
      { has: (language) => language === 'java' },
    );
    expect(await service.list(english)).toEqual({
      languages: [{ slug: 'java', displayName: 'Java', track: 'code', kind: null }],
    });
  });

  describe('a natural-language pool (§13.11)', () => {
    const rows = [
      row('python', 'Python'),
      row('en-word', 'English words'),
      row('ja-word', 'Japanese words'),
      row('ja-paragraph', 'Japanese paragraphs'),
    ];
    const service = new LanguagesService({ findEnabled: () => Promise.resolve(rows) }, allBundles);

    it('lists the Japanese pools only for an account whose display language is Japanese', async () => {
      const slugs = async (user: { locale: string }) =>
        (await service.list(user)).languages.map((language) => language.slug);
      expect(await slugs(japanese)).toEqual(['python', 'en-word', 'ja-word', 'ja-paragraph']);
      expect(await slugs(english)).toEqual(['python', 'en-word']);
      for (const locale of ['', 'en-US', 'JA', 'ja-JP', 'fr']) {
        expect(await slugs({ locale })).toEqual(['python', 'en-word']);
      }
    });

    it('says which track and kind a pool has', async () => {
      const { languages } = await service.list(japanese);
      expect(languages.map(({ slug, track, kind }) => ({ slug, track, kind }))).toEqual([
        { slug: 'python', track: 'code', kind: null },
        { slug: 'en-word', track: 'natural-en', kind: 'word' },
        { slug: 'ja-word', track: 'natural-ja', kind: 'word' },
        { slug: 'ja-paragraph', track: 'natural-ja', kind: 'paragraph' },
      ]);
    });
  });
});
