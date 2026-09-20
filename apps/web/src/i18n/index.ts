import type { Locale } from '@typing-trainer/contracts';
import i18next, { type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';

/**
 * Localization (§8.4). English is bundled, so the app can always render; Japanese is fetched the
 * first time it is chosen, and an English-speaking player never downloads it. Importing this module
 * initializes English, which is what makes `t` usable anywhere, tests included.
 */
export const i18n: I18n = i18next.createInstance();

void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false }, // React already escapes.
  initAsync: false,
  returnNull: false,
});

/**
 * A resource is loosely typed here: Japanese has no separate singular forms, so it cannot match the
 * English one's shape exactly, and a test holds every language to the same keys instead.
 */
const LOADERS: Record<Locale, () => Promise<{ default: object }>> = {
  en: () => Promise.resolve({ default: en }),
  ja: () => import('./locales/ja.json'),
};

/**
 * The language to start in for someone whose account has not said: the first language the browser
 * prefers that this app has, else English. The order is the person's own, so a browser that lists
 * English before Japanese gets English.
 */
export function detectLocale(languages: readonly string[] = navigator.languages): Locale {
  for (const language of languages) {
    const primary = language.toLowerCase().split('-')[0];
    if (primary === 'ja') return 'ja';
    if (primary === 'en') return 'en';
  }
  return 'en';
}

/**
 * Switches the interface language, loading its resource first if it is not in yet, and marks the
 * document so the browser hyphenates, reads, and picks fonts for the right language (§8.4).
 */
export async function applyLocale(locale: Locale): Promise<void> {
  const mine = (latest += 1);
  if (!i18n.hasResourceBundle(locale, 'translation')) {
    const { default: resource } = await LOADERS[locale]();
    i18n.addResourceBundle(locale, 'translation', resource);
  }
  // Loading takes a while for a language not yet in. If a later request came in meanwhile, it is the
  // one the player wants; applying this one now would put the interface in the wrong language.
  if (mine !== latest) return;
  await i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
}

/** The newest `applyLocale` request, so an older one that finishes late can stand down. */
let latest = 0;

export { useTranslation } from 'react-i18next';
