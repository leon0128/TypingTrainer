import type { ContentLanguage, GhostPeriod, GhostRecordsResponse } from '@typing-trainer/contracts';
import { CPU_MAX_LEVEL, CPU_MIN_LEVEL, cpuBaseKpm } from '@typing-trainer/typing-engine';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { describeError } from '../../lib/api/describe-error';
import { useTranslation } from '../../i18n';
import { getGhostRecords } from '../../lib/api/ghost-records';
import { startSession, type Opponent } from '../../lib/api/play';
import { useRunSession } from '../play/run-session';
import { RatingSummary } from '../rating/RatingSummary';
import { useRatings } from '../rating/use-ratings';
import { poolName } from './tracks';
import { useTrack, useTrackLanguages } from './use-track';

type Mode = 'single' | 'cpu' | 'ghost';

const MODES: Mode[] = ['single', 'cpu', 'ghost'];

/** The record a Ghost reproduces, by period (§4.4). */
const GHOST_PERIODS: GhostPeriod[] = ['daily', 'weekly', 'total'];

const SELECTED = 'ui-tab is-active';
const UNSELECTED = 'ui-tab';

/**
 * The start screen of a track (F-03, §13.9): pick a mode and a pool, and the server issues the
 * run. For code the pools are the programming languages; for a natural-language track they are the
 * kinds of text.
 */
export function TrackStartScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const begin = useRunSession((state) => state.begin);
  const ratings = useRatings();
  const track = useTrack();
  const { languages, error: languagesError } = useTrackLanguages();

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<ContentLanguage | null>(null);
  const [mode, setMode] = useState<Mode>('single');
  const [levelText, setLevelText] = useState('1');
  const [ghostPeriod, setGhostPeriod] = useState<GhostPeriod>('daily');
  const [records, setRecords] = useState<GhostRecordsResponse | null>(null);
  const level = /^\d{1,3}$/.test(levelText) ? Number(levelText) : NaN;
  const levelValid = level >= CPU_MIN_LEVEL && level <= CPU_MAX_LEVEL;
  const canStart = starting === null && (mode !== 'cpu' || levelValid);

  /** The score of the record a Ghost would reproduce, or null when there is none to race (§4.4). */
  const recordFor = (language: ContentLanguage): number | null => {
    const entry = records?.languages.find((candidate) => candidate.language === language);
    const score = entry?.[ghostPeriod] ?? null;
    return score !== null && score >= 1 ? score : null;
  };

  // The records change with every run, so they are read each time Ghost is chosen.
  useEffect(() => {
    if (mode !== 'ghost') return;
    const controller = new AbortController();
    getGhostRecords(controller.signal)
      .then(setRecords)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(describeError(cause));
      });
    return () => {
      controller.abort();
    };
  }, [mode]);

  const start = (language: ContentLanguage) => {
    if (!canStart) return;
    const opponent: Opponent =
      mode === 'cpu'
        ? { mode: 'cpu', cpuLevel: level }
        : mode === 'ghost'
          ? { mode: 'ghost', ghostPeriod }
          : { mode: 'single' };
    setStarting(language);
    setError(null);
    startSession(language, opponent)
      .then((issued) => {
        // The run time is measured from here: idle counts from the moment the run was issued.
        begin(issued, performance.now());
        void navigate('/play');
      })
      .catch((cause: unknown) => {
        setError(describeError(cause));
        setStarting(null);
      });
  };

  return (
    <main className="ui-page mx-auto flex max-w-5xl flex-col gap-6 p-6">
      {ratings !== null && <RatingSummary languages={ratings.languages} track={track} />}

      <h2 className="ui-title text-lg">{t('home.modeHeading')}</h2>

      <div
        className="flex flex-wrap items-center gap-3"
        role="group"
        aria-label={t('home.modeGroup')}
      >
        {MODES.map((entry) => (
          <button
            key={entry}
            type="button"
            aria-pressed={mode === entry}
            className={mode === entry ? SELECTED : UNSELECTED}
            onClick={() => {
              setMode(entry);
              // Forget the last look at the records, so a stale one is never shown while the new loads.
              if (entry === 'ghost') setRecords(null);
            }}
          >
            {t(`modes.${entry}`)}
          </button>
        ))}
        {mode === 'cpu' && (
          <label className="flex items-center gap-2 text-sm">
            {t('home.cpuLevel', { min: CPU_MIN_LEVEL, max: CPU_MAX_LEVEL })}
            <input
              className="ui-input w-20 px-2 py-1"
              inputMode="numeric"
              value={levelText}
              aria-invalid={!levelValid}
              onChange={(event) => {
                setLevelText(event.target.value.trim());
              }}
            />
            <span className="text-slate-600 dark:text-slate-400">
              {levelValid
                ? t('home.aboutKpm', { kpm: Math.round(cpuBaseKpm(level, track)) })
                : t('home.levelInvalid', { min: CPU_MIN_LEVEL, max: CPU_MAX_LEVEL })}
            </span>
          </label>
        )}
      </div>

      {mode === 'ghost' && (
        <div className="flex flex-col gap-2">
          <div
            className="flex flex-wrap items-center gap-3"
            role="group"
            aria-label={t('home.recordGroup')}
          >
            <span className="text-sm">{t('home.raceBest')}</span>
            {GHOST_PERIODS.map((entry) => (
              <button
                key={entry}
                type="button"
                aria-pressed={ghostPeriod === entry}
                className={ghostPeriod === entry ? SELECTED : UNSELECTED}
                onClick={() => {
                  setGhostPeriod(entry);
                }}
              >
                {t(`periodsShort.${entry}`)}
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">{t('home.ghostExplain')}</p>
        </div>
      )}

      <h2 className="ui-title text-lg">{t('home.heading')}</h2>

      {(error ?? languagesError) !== null && (
        <p
          className="rounded border border-red-500 px-3 py-2 text-red-700 dark:text-red-400"
          role="alert"
        >
          {error ?? languagesError}
        </p>
      )}

      {languages === null ? (
        <p role="status">{t('home.loadingLanguages')}</p>
      ) : languages.length === 0 ? (
        <p role="status">{t('home.noLanguages')}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {languages.map((language) => (
            <li key={language.slug}>
              {(() => {
                const record = mode === 'ghost' ? recordFor(language.slug) : null;
                const noRecord = mode === 'ghost' && records !== null && record === null;
                const rated = ratings?.languages.find((entry) => entry.language === language.slug);
                return (
                  <button
                    className="ui-tile ui-card w-full px-3 py-4"
                    type="button"
                    disabled={!canStart || (mode === 'ghost' && record === null)}
                    onClick={() => {
                      start(language.slug);
                    }}
                  >
                    {starting === language.slug ? t('home.starting') : poolName(t, language)}
                    {rated !== undefined && ' '}
                    {rated !== undefined && (
                      <span className="block text-xs text-slate-600 dark:text-slate-400">
                        {rated.gamesPlayed === 0
                          ? t('rating.unplayed')
                          : t('rating.tile', { rating: rated.rating })}
                      </span>
                    )}
                    {mode === 'ghost' && records !== null && (
                      <span className="block text-xs text-slate-600 dark:text-slate-400">
                        {noRecord ? t('home.noRecord') : t('home.best', { score: record })}
                      </span>
                    )}
                  </button>
                );
              })()}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
