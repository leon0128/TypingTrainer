import { CPU_LEVEL_COUNT, type ConquestsResponse, type Language } from '@typing-trainer/contracts';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { getConquests } from '../../lib/api/conquests';
import { describeError } from '../../lib/api/describe-error';
import { listLanguages } from '../../lib/api/languages';

/** Levels per row of the grid: ten rows of ten cover 1–100 (§4.3.4). */
const GRID_COLUMNS = 10;

function LevelGrid({ language, beaten }: { language: string; beaten: ReadonlySet<number> }) {
  return (
    <ol
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${String(GRID_COLUMNS)}, minmax(0, 1fr))` }}
      aria-label={`${language} levels`}
    >
      {Array.from({ length: CPU_LEVEL_COUNT }, (_, index) => {
        const level = index + 1;
        const done = beaten.has(level);
        return (
          <li
            key={level}
            aria-label={`Level ${String(level)} ${done ? 'beaten' : 'not beaten'}`}
            className={
              done
                ? 'rounded border border-slate-800 bg-slate-800 py-1 text-center text-xs text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900'
                : 'rounded border border-slate-300 py-1 text-center text-xs text-slate-500 dark:border-slate-700'
            }
          >
            {/* A mark as well as a fill, so the state is not conveyed by color alone. */}
            {level}
            {done ? ' ✓' : ''}
          </li>
        );
      })}
    </ol>
  );
}

/** The player's own vs CPU conquest records, per language (§4.3.4). */
export function ConquestsScreen() {
  const [languages, setLanguages] = useState<Language[] | null>(null);
  const [conquests, setConquests] = useState<ConquestsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([listLanguages(controller.signal), getConquests(controller.signal)])
      .then(([list, state]) => {
        setLanguages(list);
        setConquests(state);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(describeError(cause));
      });
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">CPU conquests</h1>
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

      {conquests === null || languages === null
        ? error === null && <p role="status">Loading conquests…</p>
        : conquests.languages.map((entry) => (
            <section key={entry.language} className="flex flex-col gap-2">
              <h2 className="flex flex-wrap items-baseline gap-x-4 text-lg font-medium">
                {languages.find((language) => language.slug === entry.language)?.displayName ??
                  entry.language}
                <span className="text-sm font-normal text-slate-600 dark:text-slate-400">
                  Highest level beaten: {entry.highestLevel ?? '—'} · Beaten: {entry.totalConquests}{' '}
                  / {CPU_LEVEL_COUNT}
                </span>
              </h2>
              <LevelGrid language={entry.language} beaten={new Set(entry.beatenLevels)} />
            </section>
          ))}

      <p className="text-sm text-slate-600 dark:text-slate-400">
        A level counts once you win against it in vs CPU (a tie is a win). Deleting the run that
        beat it removes the conquest.
      </p>
    </main>
  );
}
