import type en from './locales/en.json';

/** Keys are checked against the English resource, so a missing or misspelled key fails typecheck. */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}
