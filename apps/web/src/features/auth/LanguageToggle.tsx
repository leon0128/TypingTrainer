import { LOCALES, type Locale } from '@typing-trainer/contracts';

import { useTranslation } from '../../i18n';
import { useAppearance } from '../appearance/appearance-store';

/**
 * The interface language, chosen before anyone has an account (§8.4). It lasts for this visit only;
 * an account keeps its own language, which registration is given if this one is not English. Each
 * name is written in its own language and marked as such, so it can be found and read by anyone.
 */
export function LanguageToggle() {
  const { t } = useTranslation();
  const locale = useAppearance((state) => state.locale);
  const setLocale = useAppearance((state) => state.setLocaleLocally);

  return (
    <div
      className="flex justify-end gap-2 text-sm"
      role="group"
      aria-label={t('auth.languageSwitch')}
    >
      {LOCALES.map((entry: Locale) => (
        <button
          key={entry}
          type="button"
          lang={entry}
          aria-pressed={entry === locale}
          className={
            entry === locale
              ? 'rounded bg-slate-800 px-2 py-1 text-white dark:bg-slate-200 dark:text-slate-900'
              : 'rounded border border-slate-400 px-2 py-1'
          }
          onClick={() => {
            setLocale(entry);
          }}
        >
          {t(`languageNames.${entry}`)}
        </button>
      ))}
    </div>
  );
}
