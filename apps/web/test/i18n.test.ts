// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { applyLocale, detectLocale, i18n } from '../src/i18n';

afterEach(async () => {
  await applyLocale('en');
});

describe('detectLocale', () => {
  it('follows the browser for Japanese, in any of its forms', () => {
    expect(detectLocale(['ja'])).toBe('ja');
    expect(detectLocale(['ja-JP'])).toBe('ja');
    expect(detectLocale(['JA-jp'])).toBe('ja');
    expect(detectLocale(['en-US', 'ja'])).toBe('ja');
  });

  it('is English for anything else, and when there is nothing to go on', () => {
    expect(detectLocale(['en-US'])).toBe('en');
    expect(detectLocale(['fr', 'de-DE'])).toBe('en');
    expect(detectLocale([])).toBe('en');
    // A language merely starting with the same letter is not Japanese.
    expect(detectLocale(['jv'])).toBe('en');
  });
});

describe('applyLocale', () => {
  it('starts in English with only English loaded', () => {
    expect(i18n.language).toBe('en');
    expect(i18n.hasResourceBundle('ja', 'translation')).toBe(false);
  });

  it('loads Japanese when it is first chosen, and switches the language and the document', async () => {
    await applyLocale('ja');
    expect(i18n.hasResourceBundle('ja', 'translation')).toBe(true);
    expect(i18n.language).toBe('ja');
    expect(document.documentElement.lang).toBe('ja');
    expect(i18n.t('errors.authRequired')).toBe('ログインが必要です');
  });

  it('switches back to English at once, keeping Japanese loaded for next time', async () => {
    await applyLocale('ja');
    await applyLocale('en');
    expect(i18n.language).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(i18n.t('errors.authRequired')).toBe('authentication required');
    expect(i18n.hasResourceBundle('ja', 'translation')).toBe(true);
  });

  it('interpolates values and picks the plural form of the language', async () => {
    expect(i18n.t('errors.retryIn', { message: 'busy', count: 1 })).toBe(
      'busy — try again in 1 second.',
    );
    expect(i18n.t('errors.retryIn', { message: 'busy', count: 30 })).toBe(
      'busy — try again in 30 seconds.',
    );
    await applyLocale('ja');
    // Japanese has one form for every count.
    expect(i18n.t('errors.retryIn', { message: 'busy', count: 1 })).toBe(
      'busy — 1秒後にもう一度お試しください。',
    );
    expect(i18n.t('errors.retryIn', { message: 'busy', count: 30 })).toBe(
      'busy — 30秒後にもう一度お試しください。',
    );
  });

  it('does not escape what it interpolates, since React does', () => {
    expect(i18n.t('errors.languageUnavailable', { language: 'C&C' })).toBe(
      'language "C&C" is not available',
    );
  });
});
