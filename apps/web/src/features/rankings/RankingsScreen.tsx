import type {
  ContentLanguage,
  Language,
  RankingEntry,
  RankingPeriod,
} from '@typing-trainer/contracts';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { i18n, useTranslation } from '../../i18n';
import { describeError } from '../../lib/api/describe-error';
import { listLanguages } from '../../lib/api/languages';
import { getRankings } from '../../lib/api/rankings';
import { formatPercent } from '../play/format';
import { Logo } from '../../components/Logo';

const PERIODS: RankingPeriod[] = ['daily', 'weekly', 'total'];

/** The player's own top 10 runs by period and language (§6.1) — never other players' scores. */
export function RankingsScreen() {
  const { t } = useTranslation();
  const [languages, setLanguages] = useState<Language[] | null>(null);
  const [language, setLanguage] = useState<ContentLanguage | null>(null);
  const [period, setPeriod] = useState<RankingPeriod>('daily');
  const [entries, setEntries] = useState<{ key: string; rows: RankingEntry[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const entriesKey = language === null ? null : `${period}:${language}`;

  useEffect(() => {
    const controller = new AbortController();
    listLanguages(controller.signal)
      .then((list) => {
        setLanguages(list);
        setLanguage((current) => current ?? list[0]?.slug ?? null);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(describeError(cause));
      });
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (language === null || entriesKey === null) return;
    const controller = new AbortController();
    getRankings(period, language)
      .then((response) => {
        if (!controller.signal.aborted) setEntries({ key: entriesKey, rows: response.entries });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(describeError(cause));
      });
    return () => {
      controller.abort();
    };
  }, [period, language, entriesKey]);

  // The previous period/language's rows would otherwise flash before the new request resolves.
  const shown = entries?.key === entriesKey ? entries.rows : null;

  return (
    <main className="ui-page mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <Logo />
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="ui-title text-2xl font-semibold">{t('rankings.title')}</h1>
        <Link className="ui-chip" to="/">
          {t('common.chooseLanguage')}
        </Link>
      </header>

      {error !== null && (
        <p
          className="rounded border border-red-500 px-3 py-2 text-red-700 dark:text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}

      {languages === null ? (
        <p role="status">{t('common.loading')}</p>
      ) : (
        <>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={t('rankings.languageGroup')}
          >
            {languages.map((entry) => (
              <button
                key={entry.slug}
                type="button"
                aria-pressed={entry.slug === language}
                className={entry.slug === language ? 'ui-tab is-active' : 'ui-tab'}
                onClick={() => {
                  setLanguage(entry.slug);
                }}
              >
                {entry.displayName}
              </button>
            ))}
          </div>

          <div className="flex gap-2" role="group" aria-label={t('rankings.periodGroup')}>
            {PERIODS.map((entry) => (
              <button
                key={entry}
                type="button"
                aria-pressed={entry === period}
                className={entry === period ? 'ui-tab is-active' : 'ui-tab'}
                onClick={() => {
                  setPeriod(entry);
                }}
              >
                {t(`periodsShort.${entry}`)}
              </button>
            ))}
          </div>

          {shown === null ? (
            <p role="status">{t('rankings.loading')}</p>
          ) : shown.length === 0 ? (
            <p role="status">{t('rankings.empty')}</p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-400">
                  <th className="py-1 pr-2">{t('rankings.rank')}</th>
                  <th className="py-1 pr-2">{t('rankings.score')}</th>
                  <th className="py-1 pr-2">{t('rankings.kpm')}</th>
                  <th className="py-1 pr-2">{t('rankings.accuracy')}</th>
                  <th className="py-1">{t('rankings.when')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((entry, index) => (
                  <tr key={entry.id} className="border-b border-slate-200 dark:border-slate-800">
                    <td className="py-1 pr-2">{index + 1}</td>
                    <td className="py-1 pr-2">{entry.score}</td>
                    <td className="py-1 pr-2">{entry.kpm}</td>
                    <td className="py-1 pr-2">{formatPercent(entry.accuracy)}</td>
                    <td className="py-1">
                      {new Date(entry.startedAt).toLocaleString(i18n.language)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  );
}
