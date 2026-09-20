import type {
  ContentLanguage,
  DashboardPoint,
  DashboardResponse,
  Language,
  RankingPeriod,
} from '@typing-trainer/contracts';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { getDashboard } from '../../lib/api/dashboard';
import { describeError } from '../../lib/api/describe-error';
import { listLanguages } from '../../lib/api/languages';
import { useAuthStore } from '../auth/auth-store';
import { CHART_HEIGHT, CHART_PADDING, CHART_WIDTH, plot } from './chart';

const PERIODS: { value: RankingPeriod; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'total', label: 'All time' },
];

/** Range filters for the all-time view (§6.2); null is "all". */
const RANGES: { days: number | null; label: string }[] = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '365 days' },
  { days: null, label: 'All' },
];

function addDays(date: string, delta: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + delta);
  return moved.toISOString().slice(0, 10);
}

/** Today in the player's profile time zone, which is what the server's "today" means (§6.4). */
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

function pointLabel(period: RankingPeriod, x: string): string {
  return period === 'daily' ? new Date(x).toLocaleString() : x;
}

function Chart({ points, period }: { points: DashboardPoint[]; period: RankingPeriod }) {
  const { segments, points: plotted, yMax } = plot(points);
  const { left, top, bottom } = CHART_PADDING;
  const baseline = CHART_HEIGHT - bottom;
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <svg
      viewBox={`0 0 ${String(CHART_WIDTH)} ${String(CHART_HEIGHT)}`}
      className="w-full"
      role="img"
      aria-label="Score trend"
    >
      <line x1={left} x2={left} y1={top} y2={baseline} stroke="currentColor" opacity={0.4} />
      <line
        x1={left}
        x2={CHART_WIDTH - CHART_PADDING.right}
        y1={baseline}
        y2={baseline}
        stroke="currentColor"
        opacity={0.4}
      />
      <text x={left - 6} y={top + 4} textAnchor="end" fontSize={11} fill="currentColor">
        {yMax}
      </text>
      <text x={left - 6} y={baseline} textAnchor="end" fontSize={11} fill="currentColor">
        0
      </text>
      {first !== undefined && last !== undefined && (
        <>
          <text x={left} y={CHART_HEIGHT - 8} fontSize={11} fill="currentColor">
            {pointLabel(period, first.x)}
          </text>
          <text
            x={CHART_WIDTH - CHART_PADDING.right}
            y={CHART_HEIGHT - 8}
            textAnchor="end"
            fontSize={11}
            fill="currentColor"
          >
            {pointLabel(period, last.x)}
          </text>
        </>
      )}
      {segments.map((segment) => (
        <polyline
          key={segment[0]?.label}
          points={segment.map((point) => `${String(point.x)},${String(point.y)}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        />
      ))}
      {plotted.map((point) => (
        <circle key={point.label} cx={point.x} cy={point.y} r={3.5} fill="currentColor">
          <title>{`${pointLabel(period, point.label)}: ${String(point.score)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** The player's own score trend by period and language, with a summary strip (§6.2). */
export function DashboardScreen() {
  const timezone = useAuthStore((state) => state.user?.timezone ?? 'UTC');
  const [languages, setLanguages] = useState<Language[] | null>(null);
  const [language, setLanguage] = useState<ContentLanguage | null>(null);
  const [period, setPeriod] = useState<RankingPeriod>('weekly');
  /** Anchor of the daily and weekly views: undefined is "now"; the arrows move it. */
  const [anchor, setAnchor] = useState<string | undefined>(undefined);
  const [rangeDays, setRangeDays] = useState<number | null>(90);
  const [loaded, setLoaded] = useState<{ key: string; data: DashboardResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const from =
    period === 'total'
      ? rangeDays === null
        ? undefined
        : addDays(todayIn(timezone), 1 - rangeDays)
      : anchor;
  const key = language === null ? null : `${period}:${language}:${from ?? ''}`;

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
    if (language === null || key === null) return;
    const controller = new AbortController();
    getDashboard({ period, language, ...(from === undefined ? {} : { from }) }, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setError(null);
          setLoaded({ key, data });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(describeError(cause));
      });
    return () => {
      controller.abort();
    };
  }, [period, language, key, from]);

  const shown = loaded?.key === key ? loaded.data : null;
  const step = period === 'weekly' ? 7 : 1;
  const move = (delta: number) => {
    if (shown?.from != null) setAnchor(addDays(shown.from, delta * step));
  };
  const buttonClass = (active: boolean) =>
    active
      ? 'rounded bg-slate-800 px-3 py-1 text-white dark:bg-slate-200 dark:text-slate-900'
      : 'rounded border border-slate-400 px-3 py-1';

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
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
          {shown !== null && (
            <section aria-label="Summary" className="grid grid-cols-2 gap-3 text-sm">
              <p>
                Total runs: <strong>{shown.summary.totalRuns}</strong>
              </p>
              <p>
                Keystrokes: <strong>{shown.summary.totalKeystrokes}</strong>
              </p>
              <p className="col-span-2">
                Best score:{' '}
                {shown.summary.bestScores.length === 0
                  ? '—'
                  : shown.summary.bestScores
                      .map(
                        (best) =>
                          `${languages.find((entry) => entry.slug === best.language)?.displayName ?? best.language} ${String(best.score)}`,
                      )
                      .join(' · ')}
              </p>
              <p className="col-span-2">
                Highest CPU level beaten: {shown.summary.highestCpuLevelBeaten ?? '—'}
              </p>
            </section>
          )}

          <div className="flex flex-wrap gap-2" role="group" aria-label="Language">
            {languages.map((entry) => (
              <button
                key={entry.slug}
                type="button"
                aria-pressed={entry.slug === language}
                className={buttonClass(entry.slug === language)}
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
                className={buttonClass(entry.value === period)}
                onClick={() => {
                  setPeriod(entry.value);
                  setAnchor(undefined);
                }}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {period === 'total' ? (
            <div className="flex gap-2" role="group" aria-label="Range">
              {RANGES.map((entry) => (
                <button
                  key={entry.label}
                  type="button"
                  aria-pressed={entry.days === rangeDays}
                  className={buttonClass(entry.days === rangeDays)}
                  onClick={() => {
                    setRangeDays(entry.days);
                  }}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={buttonClass(false)}
                disabled={shown === null}
                onClick={() => {
                  move(-1);
                }}
              >
                ← Previous
              </button>
              <span>{shown?.from ?? '…'}</span>
              <button
                type="button"
                className={buttonClass(false)}
                disabled={shown === null}
                onClick={() => {
                  move(1);
                }}
              >
                Next →
              </button>
            </div>
          )}

          {shown === null ? (
            <p role="status">Loading dashboard…</p>
          ) : shown.points.every((point) => point.score === null) ? (
            <p role="status">No runs for this period.</p>
          ) : (
            <Chart points={shown.points} period={period} />
          )}
        </>
      )}
    </main>
  );
}
