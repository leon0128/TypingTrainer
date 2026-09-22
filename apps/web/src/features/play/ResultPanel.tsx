import type { GhostPeriod, PlayMode, PlayRun } from '@typing-trainer/contracts';
import {
  CPU_MAX_LEVEL,
  CPU_MIN_LEVEL,
  type OfficialMetrics,
} from '@typing-trainer/typing-engine';
import type { TFunction } from 'i18next';

import { i18n, useTranslation } from '../../i18n';
import type { Opponent } from '../../lib/api/play';
import { RatingResult } from '../rating/RatingResult';
import { formatPercent } from './format';
import type { Submission } from './run-session';

const GHOST_PERIODS: GhostPeriod[] = ['daily', 'weekly', 'total'];

export interface ResultPanelProps {
  /** What the client counted, shown while the server's answer is still on its way. */
  readonly metrics: OfficialMetrics;
  readonly submission: Submission;
  /** What the run just played, so the rematch buttons can offer to play it again. */
  readonly mode: PlayMode;
  readonly cpuLevel: number | null;
  readonly ghostPeriod: GhostPeriod | null;
  readonly onRetry: () => void;
  /** Starts a new run of the given kind right away, without going through the play screen. */
  readonly onRematch: (opponent: Opponent) => void;
  /** True while a rematch run is being requested, to keep the buttons from being pressed twice. */
  readonly rematching: boolean;
  /** What went wrong asking for a rematch, if anything did. */
  readonly rematchError: string | null;
  /** Leaves this run behind and goes to the track's play screen to choose a new one. */
  readonly onBackToPlay: () => void;
}

/**
 * What the run scored (F-04, §3.6). Once the server answers, its stored numbers are the ones
 * shown: the client's own are never what counts (§9.8).
 */
export function ResultPanel({
  metrics,
  submission,
  mode,
  cpuLevel,
  ghostPeriod,
  onRetry,
  onRematch,
  rematching,
  rematchError,
  onBackToPlay,
}: ResultPanelProps) {
  const { t } = useTranslation();
  const stored = submission.kind === 'saved' ? submission.run : null;
  const shown = stored ?? metrics;
  const effective = stored?.effectiveKeystrokes ?? metrics.effective;
  const miss = stored?.missCount ?? metrics.miss;
  const raw = stored?.rawKeystrokes ?? metrics.raw;

  return (
    <section className="result-panel" aria-labelledby="result-title">
      <h2
        id="result-title"
        className={
          submission.kind === 'saved' && submission.run.result == null ? 'sr-only' : undefined
        }
      >
        {title(submission, t)}
      </h2>
      <p className="submission" role="status">
        {statusLine(submission, t)}
      </p>
      {stored?.result != null && (
        <p className="match-result">
          {t('result.matchLine', {
            opponent: opponentName(stored, t),
            opponentScore: stored.opponentScore,
            score: stored.score,
          })}{' '}
          {stored.result === 'win' ? t('result.tieWins') : ''}
        </p>
      )}

      {submission.kind !== 'discarded' && submission.kind !== 'empty' && (
        <dl>
          <dt>{t('result.score')}</dt>
          <dd>{shown.score}</dd>

          <dt>{t('result.kpm')}</dt>
          <dd>
            {shown.kpm} <small>{t('result.kpmNote')}</small>
          </dd>

          <dt>{t('result.accuracy')}</dt>
          <dd>
            {formatPercent(shown.accuracy)}{' '}
            <small>{t('result.missRate', { value: formatPercent(1 - shown.accuracy) })}</small>
          </dd>

          <dt>{t('result.keystrokes')}</dt>
          <dd>{t('result.keystrokeCounts', { effective, miss, raw })}</dd>
        </dl>
      )}

      {submission.kind === 'saved' && submission.rating !== null && (
        <RatingResult rating={submission.rating} />
      )}

      <p className="result-actions">
        {submission.kind === 'failed' && submission.canRetry && (
          <button className="ui-tab" type="button" onClick={onRetry}>
            {t('result.sendAgain')}
          </button>
        )}
        {mode === 'single' && (
          <button
            className="ui-tab"
            type="button"
            disabled={rematching}
            onClick={() => {
              onRematch({ mode: 'single' });
            }}
          >
            {t('result.rematch')}
          </button>
        )}
        {mode === 'cpu' && cpuLevel !== null && (
          <>
            {cpuLevel < CPU_MAX_LEVEL && (
              <button
                className="ui-tab"
                type="button"
                disabled={rematching}
                onClick={() => {
                  onRematch({ mode: 'cpu', cpuLevel: cpuLevel + 1 });
                }}
              >
                {t('result.raiseLevel')}
              </button>
            )}
            {cpuLevel > CPU_MIN_LEVEL && (
              <button
                className="ui-tab"
                type="button"
                disabled={rematching}
                onClick={() => {
                  onRematch({ mode: 'cpu', cpuLevel: cpuLevel - 1 });
                }}
              >
                {t('result.lowerLevel')}
              </button>
            )}
            <button
              className="ui-tab"
              type="button"
              disabled={rematching}
              onClick={() => {
                onRematch({ mode: 'cpu', cpuLevel });
              }}
            >
              {t('result.sameLevel')}
            </button>
          </>
        )}
        {mode === 'ghost' &&
          GHOST_PERIODS.map((period) => (
            <button
              key={period}
              className="ui-tab"
              type="button"
              aria-pressed={ghostPeriod === period}
              disabled={rematching}
              onClick={() => {
                onRematch({ mode: 'ghost', ghostPeriod: period });
              }}
            >
              {t(`periodsShort.${period}`)}
            </button>
          ))}
        <button className="ui-btn" type="button" onClick={onBackToPlay}>
          {t('result.backToPlay')}
        </button>
      </p>
      {rematchError !== null && (
        <p className="submission" role="alert">
          {rematchError}
        </p>
      )}
    </section>
  );
}

/** Who the player raced, as the stored run names them. */
function opponentName(run: PlayRun, t: TFunction): string {
  if (run.cpuLevel !== null) return t('opponent.cpu', { level: run.cpuLevel });
  return run.ghostPeriod === null
    ? t('result.unknownOpponent')
    : t('opponent.ghostShort', { period: t(`periodBest.${run.ghostPeriod}`) });
}

function title(submission: Submission, t: TFunction): string {
  switch (submission.kind) {
    case 'discarded':
      return t('result.discarded');
    case 'empty':
      return t('result.empty');
    case 'saved':
      if (submission.run.result === 'win') return t('result.won');
      if (submission.run.result === 'lose') return t('result.lost');
      return t('result.saved');
    default:
      return t('result.over');
  }
}

/** A calendar date, as the player's language writes it; the day is fixed, so no time zone applies. */
function dateOf(isoDate: string): string {
  return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

function statusLine(submission: Submission, t: TFunction): string {
  switch (submission.kind) {
    case 'unsent':
    case 'sending':
      return t('result.saving');
    case 'saved':
      return t('result.savedFor', { date: dateOf(submission.run.localDate) });
    case 'empty':
      return t('result.noKeystroke');
    case 'discarded':
      return t('result.idle');
    case 'failed':
      return submission.message;
  }
}
