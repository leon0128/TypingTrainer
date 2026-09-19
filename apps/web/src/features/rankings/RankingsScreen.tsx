import type {
  ContentLanguage,
  Language,
  RankingEntry,
  RankingPeriod,
} from '@typing-trainer/contracts';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { describeError } from '../../lib/api/describe-error';
import { listLanguages } from '../../lib/api/languages';
import { getRankings } from '../../lib/api/rankings';
import { formatPercent } from '../play/format';

const PERIODS: { value: RankingPeriod; label: string }[] = [
  { value: 'daily', label: 'Today' },
  { value: 'weekly', label: 'This week' },
  { value: 'total', label: 'All time' },
];

/** The player's own top 10 runs by period and language (§6.1) — never other players' scores. */
export function RankingsScreen() {
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
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Your rankings</h1>
        <Link className="underline" to="/">
          Choose a language
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
        <p role="status">Loading…</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Language">
            {languages.map((entry) => (
              <button
                key={entry.slug}
                type="button"
                aria-pressed={entry.slug === language}
                className={
                  entry.slug === language
                    ? 'rounded bg-slate-800 px-3 py-1 text-white dark:bg-slate-200 dark:text-slate-900'
                    : 'rounded border border-slate-400 px-3 py-1'
                }
                onClick={() => {
                  setLanguage(entry.slug);
                }}
              >
                {entry.displayName}
              </button>
            ))}
          </div>

          <div className="flex gap-2" role="group" aria-label="Period">
            {PERIODS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                aria-pressed={entry.value === period}
                className={
                  entry.value === period
                    ? 'rounded bg-slate-800 px-3 py-1 text-white dark:bg-slate-200 dark:text-slate-900'
                    : 'rounded border border-slate-400 px-3 py-1'
                }
                onClick={() => {
                  setPeriod(entry.value);
                }}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {shown === null ? (
            <p role="status">Loading rankings…</p>
          ) : shown.length === 0 ? (
            <p role="status">No runs yet for this period.</p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-400">
                  <th className="py-1 pr-2">#</th>
                  <th className="py-1 pr-2">Score</th>
                  <th className="py-1 pr-2">KPM</th>
                  <th className="py-1 pr-2">Accuracy</th>
                  <th className="py-1">When</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((entry, index) => (
                  <tr key={entry.id} className="border-b border-slate-200 dark:border-slate-800">
                    <td className="py-1 pr-2">{index + 1}</td>
                    <td className="py-1 pr-2">{entry.score}</td>
                    <td className="py-1 pr-2">{entry.kpm}</td>
                    <td className="py-1 pr-2">{formatPercent(entry.accuracy)}</td>
                    <td className="py-1">{new Date(entry.startedAt).toLocaleString()}</td>
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
