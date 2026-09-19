import type {
  ContentLanguage,
  HistoryEntry,
  HistoryRequest,
  Language,
  PlayMode,
  RankingPeriod,
} from '@typing-trainer/contracts';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { describeError } from '../../lib/api/describe-error';
import { deleteHistoryEntry, getHistory } from '../../lib/api/history';
import { listLanguages } from '../../lib/api/languages';
import { formatPercent } from '../play/format';

const PERIODS: { value: RankingPeriod | ''; label: string }[] = [
  { value: '', label: 'All time' },
  { value: 'daily', label: 'Today' },
  { value: 'weekly', label: 'This week' },
];

const PAGE_SIZE = 20;

interface Filters {
  readonly period: RankingPeriod | '';
  readonly mode: PlayMode | '';
  readonly language: ContentLanguage | '';
}

/** Play history (F-08, §6.3): the player's own runs, filterable, with per-row hard delete. */
export function HistoryScreen() {
  const [languages, setLanguages] = useState<Language[] | null>(null);
  const [filters, setFilters] = useState<Filters>({ period: '', mode: '', language: '' });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<HistoryEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    listLanguages()
      .then(setLanguages)
      .catch((cause: unknown) => {
        setError(describeError(cause));
      });
  }, []);

  const request: Partial<HistoryRequest> = {
    page,
    pageSize: PAGE_SIZE,
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
    if (!window.confirm('Delete this run? This cannot be undone.')) return;
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
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Your history</h1>
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

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Period
          <select
            className="rounded border border-slate-400 px-2 py-1"
            value={filters.period}
            onChange={(event) => {
              setFilter('period', event.target.value as RankingPeriod | '');
            }}
          >
            {PERIODS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Language
          <select
            className="rounded border border-slate-400 px-2 py-1"
            value={filters.language}
            onChange={(event) => {
              setFilter('language', event.target.value as ContentLanguage | '');
            }}
          >
            <option value="">All</option>
            {(languages ?? []).map((entry) => (
              <option key={entry.slug} value={entry.slug}>
                {entry.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rows === null ? (
        <p role="status">Loading…</p>
      ) : rows.length === 0 ? (
        <p role="status">No runs match these filters.</p>
      ) : (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-400">
              <th className="py-1 pr-2">When</th>
              <th className="py-1 pr-2">Mode</th>
              <th className="py-1 pr-2">Language</th>
              <th className="py-1 pr-2">KPM</th>
              <th className="py-1 pr-2">Accuracy</th>
              <th className="py-1 pr-2">Score</th>
              <th className="py-1 pr-2">Result</th>
              <th className="py-1"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-200 dark:border-slate-800">
                <td className="py-1 pr-2">{new Date(row.startedAt).toLocaleString()}</td>
                <td className="py-1 pr-2">{row.mode}</td>
                <td className="py-1 pr-2">{row.language}</td>
                <td className="py-1 pr-2">{row.kpm}</td>
                <td className="py-1 pr-2">{formatPercent(row.accuracy)}</td>
                <td className="py-1 pr-2">{row.score}</td>
                <td className="py-1 pr-2">{row.result ?? '—'}</td>
                <td className="py-1">
                  <button
                    type="button"
                    className="text-red-700 underline disabled:opacity-60 dark:text-red-400"
                    disabled={deleting === row.id}
                    onClick={() => {
                      remove(row.id);
                    }}
                  >
                    {deleting === row.id ? 'Deleting…' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-center gap-3 text-sm">
        <button
          type="button"
          className="rounded border border-slate-400 px-2 py-1 disabled:opacity-60"
          disabled={page <= 1}
          onClick={() => {
            setPage((current) => Math.max(1, current - 1));
          }}
        >
          Previous
        </button>
        <span>
          Page {page} of {lastPage}
        </span>
        <button
          type="button"
          className="rounded border border-slate-400 px-2 py-1 disabled:opacity-60"
          disabled={page >= lastPage}
          onClick={() => {
            setPage((current) => current + 1);
          }}
        >
          Next
        </button>
      </div>
    </main>
  );
}
