import type {
  ContentLanguage,
  HistoryEntry,
  HistoryRequest,
  PlayMode,
  RankingPeriod,
} from '@typing-trainer/contracts';
import { useEffect, useState } from 'react';

import { i18n, useTranslation } from '../../i18n';
import { describeError } from '../../lib/api/describe-error';
import { deleteHistoryEntry, getHistory } from '../../lib/api/history';
import { formatPercent } from '../play/format';
import { languageLabel, poolName } from '../tracks/tracks';
import { useTrack, useTrackLanguages } from '../tracks/use-track';

/** The period filter's choices, all time first, as this screen has always listed them. */
const PERIODS: (RankingPeriod | '')[] = ['', 'daily', 'weekly'];

const MODES: PlayMode[] = ['single', 'cpu', 'ghost'];

const PAGE_SIZE = 20;

interface Filters {
  readonly period: RankingPeriod | '';
  readonly mode: PlayMode | '';
  readonly language: ContentLanguage | '';
}

/** Play history (F-08, §6.3): the player's own runs, filterable, with per-row hard delete. */
export function HistoryScreen() {
  const { t } = useTranslation();
  const track = useTrack();
  const { languages, error: languagesError } = useTrackLanguages();
  const [filters, setFilters] = useState<Filters>({ period: '', mode: '', language: '' });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<HistoryEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const request: Partial<HistoryRequest> = {
    page,
    pageSize: PAGE_SIZE,
    track,
    ...(filters.period === '' ? {} : { period: filters.period }),
    ...(filters.mode === '' ? {} : { mode: filters.mode }),
    ...(filters.language === '' ? {} : { language: filters.language }),
  };
  const requestKey = JSON.stringify(request);

  useEffect(() => {
    const controller = new AbortController();
    getHistory(request)
      .then((response) => {
        if (!controller.signal.aborted) {
          setRows(response.entries);
          setTotal(response.total);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(describeError(cause));
      });
    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey is the request's identity
  }, [requestKey]);

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const remove = (id: string) => {
    // Deletion is irreversible (§6.3): confirm before it happens, not after.
    if (!window.confirm(t('history.confirmDelete'))) return;
    setDeleting(id);
    deleteHistoryEntry(id)
      .then(() => {
        setRows((current) => current?.filter((row) => row.id !== id) ?? null);
        setTotal((current) => current - 1);
      })
      .catch((cause: unknown) => {
        setError(describeError(cause));
      })
      .finally(() => {
        setDeleting(null);
      });
  };

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="ui-page mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="ui-title text-2xl font-semibold">{t('history.title')}</h1>
      </header>

      {(error ?? languagesError) !== null && (
        <p
          className="rounded border border-red-500 px-3 py-2 text-red-700 dark:text-red-400"
          role="alert"
        >
          {error ?? languagesError}
        </p>
      )}

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm">
          {t('history.period')}
          <select
            className="ui-input px-2 py-1"
            value={filters.period}
            onChange={(event) => {
              setFilter('period', event.target.value as RankingPeriod | '');
            }}
          >
            {PERIODS.map((entry) => (
              <option key={entry} value={entry}>
                {entry === '' ? t('periodsShort.total') : t(`periodsShort.${entry}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t('history.mode')}
          <select
            className="ui-input px-2 py-1"
            value={filters.mode}
            onChange={(event) => {
              setFilter('mode', event.target.value as PlayMode | '');
            }}
          >
            <option value="">{t('history.all')}</option>
            {MODES.map((entry) => (
              <option key={entry} value={entry}>
                {t(`modes.${entry}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t('history.language')}
          <select
            className="ui-input px-2 py-1"
            value={filters.language}
            onChange={(event) => {
              setFilter('language', event.target.value as ContentLanguage | '');
            }}
          >
            <option value="">{t('history.all')}</option>
            {(languages ?? []).map((entry) => (
              <option key={entry.slug} value={entry.slug}>
                {poolName(t, entry)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rows === null ? (
        <p role="status">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <p role="status">{t('history.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          {/* Eight columns do not fit a phone, so the table scrolls inside this box instead of
              widening the page. */}
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-400">
                <th className="py-1 pr-2">{t('history.when')}</th>
                <th className="py-1 pr-2">{t('history.mode')}</th>
                <th className="py-1 pr-2">{t('history.language')}</th>
                <th className="py-1 pr-2">{t('history.kpm')}</th>
                <th className="py-1 pr-2">{t('history.accuracy')}</th>
                <th className="py-1 pr-2">{t('history.score')}</th>
                <th className="py-1 pr-2">{t('history.result')}</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-200 dark:border-slate-800">
                  <td className="py-1 pr-2">
                    {new Date(row.startedAt).toLocaleString(i18n.language)}
                  </td>
                  <td className="py-1 pr-2">{t(`modes.${row.mode}`)}</td>
                  <td className="py-1 pr-2">
                    {languageLabel(
                      t,
                      row.language,
                      languages?.find((entry) => entry.slug === row.language)?.displayName ??
                        row.language,
                    )}
                  </td>
                  <td className="py-1 pr-2">{row.kpm}</td>
                  <td className="py-1 pr-2">{formatPercent(row.accuracy)}</td>
                  <td className="py-1 pr-2">{row.score}</td>
                  <td className="py-1 pr-2">
                    {row.result === null ? '—' : t(`history.${row.result}`)}
                  </td>
                  <td className="py-1">
                    <button
                      type="button"
                      className="text-red-700 underline disabled:opacity-60 dark:text-red-400"
                      disabled={deleting === row.id}
                      onClick={() => {
                        remove(row.id);
                      }}
                    >
                      {deleting === row.id ? t('history.deleting') : t('history.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-3 text-sm">
        <button
          type="button"
          className="ui-chip px-2 py-1"
          disabled={page <= 1}
          onClick={() => {
            setPage((current) => Math.max(1, current - 1));
          }}
        >
          {t('history.previous')}
        </button>
        <span>{t('history.page', { page, last: lastPage })}</span>
        <button
          type="button"
          className="ui-chip px-2 py-1"
          disabled={page >= lastPage}
          onClick={() => {
            setPage((current) => current + 1);
          }}
        >
          {t('history.next')}
        </button>
      </div>
    </main>
  );
}
