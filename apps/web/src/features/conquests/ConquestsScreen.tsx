import { CPU_LEVEL_COUNT, type ConquestsResponse, type ContentLanguage, type Language } from '@typing-trainer/contracts';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { useTranslation } from '../../i18n';
import { getConquests } from '../../lib/api/conquests';
import { describeError } from '../../lib/api/describe-error';
import { listLanguages } from '../../lib/api/languages';
import { startSession } from '../../lib/api/play';
import { useRunSession } from '../play/run-session';
import { useRatings } from '../rating/use-ratings';

/** A mark as well as a fill, so a beaten level is not told apart by colour alone (§8.2). */
const BEATEN_MARK = ' ✓';

/** Levels per row of the grid: ten rows of ten cover 1–100 (§4.3.4). */
const GRID_COLUMNS = 10;

function LevelGrid({
  language,
  beaten,
  disabled,
  onStart,
}: {
  language: string;
  beaten: ReadonlySet<number>;
  disabled: boolean;
  onStart: (level: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <ol
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${String(GRID_COLUMNS)}, minmax(0, 1fr))` }}
      aria-label={t('conquests.levels', { language })}
    >
      {Array.from({ length: CPU_LEVEL_COUNT }, (_, index) => {
        const level = index + 1;
        const done = beaten.has(level);
        return (
          <li
            key={level}
            aria-label={t(done ? 'conquests.levelBeaten' : 'conquests.levelNotBeaten', { level })}
            className={
              done
                ? 'rounded border border-slate-800 bg-slate-800 text-center text-xs text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900'
                : 'rounded border border-slate-300 text-center text-xs text-slate-500 dark:border-slate-700'
            }
          >
            <button
              type="button"
              className="w-full py-1"
              disabled={disabled}
              aria-label={t('conquests.startLevel', { level })}
              onClick={() => {
                onStart(level);
              }}
            >
              {/* A mark as well as a fill, so the state is not conveyed by color alone. */}
              {level}
              {done ? BEATEN_MARK : ''}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** The player's own vs CPU conquest records, per language (§4.3.4). */
export function ConquestsScreen() {
  const { t } = useTranslation();
  const [languages, setLanguages] = useState<Language[] | null>(null);
  const [conquests, setConquests] = useState<ConquestsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ratings = useRatings();
  const navigate = useNavigate();
  const begin = useRunSession((state) => state.begin);
  const [starting, setStarting] = useState(false);

  const start = (language: ContentLanguage, level: number) => {
    setStarting(true);
    setError(null);
    startSession(language, { mode: 'cpu', cpuLevel: level })
      .then((issued) => {
        begin(issued, performance.now());
        void navigate('/play');
      })
      .catch((cause: unknown) => {
        setError(describeError(cause));
        setStarting(false);
      });
  };

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
    <main className="ui-page mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="ui-title text-2xl font-semibold">{t('conquests.title')}</h1>
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
        ? error === null && <p role="status">{t('conquests.loading')}</p>
        : conquests.languages.map((entry) => {
            const name =
              languages.find((language) => language.slug === entry.language)?.displayName ??
              entry.language;
            const rated = ratings?.languages.find(
              (candidate) => candidate.language === entry.language,
            );
            return (
              <section key={entry.language} className="flex flex-col gap-2">
                <h2 className="flex flex-wrap items-baseline gap-x-4 text-lg font-medium">
                  {name}
                  {rated !== undefined && (
                    <span className="text-base font-semibold">
                      {rated.gamesPlayed === 0
                        ? t('rating.unplayed')
                        : t('rating.headingValue', { rating: rated.rating })}
                    </span>
                  )}
                  <span className="text-sm font-normal text-slate-600 dark:text-slate-400">
                    {t('conquests.highest', { level: entry.highestLevel ?? '—' })} ·{' '}
                    {t('conquests.beaten', { count: entry.totalConquests, total: CPU_LEVEL_COUNT })}
                  </span>
                </h2>
                <LevelGrid
                  language={name}
                  beaten={new Set(entry.beatenLevels)}
                  disabled={starting}
                  onStart={(level) => {
                    start(entry.language, level);
                  }}
                />
              </section>
            );
          })}

      <p className="text-sm text-slate-600 dark:text-slate-400">{t('conquests.note')}</p>
    </main>
  );
}
