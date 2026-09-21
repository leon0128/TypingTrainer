import type { PlayRun } from '@typing-trainer/contracts';
import type { OfficialMetrics } from '@typing-trainer/typing-engine';
import type { TFunction } from 'i18next';

import { i18n, useTranslation } from '../../i18n';
import { formatPercent } from './format';
import type { Submission } from './run-session';

export interface ResultPanelProps {
  /** What the client counted, shown while the server's answer is still on its way. */
  readonly metrics: OfficialMetrics;
  readonly submission: Submission;
  readonly onRetry: () => void;
  readonly onPlayAgain: () => void;
}

/**
 * What the run scored (F-04, §3.6). Once the server answers, its stored numbers are the ones
 * shown: the client's own are never what counts (§9.8).
 */
export function ResultPanel({ metrics, submission, onRetry, onPlayAgain }: ResultPanelProps) {
  const { t } = useTranslation();
  const stored = submission.kind === 'saved' ? submission.run : null;
  const shown = stored ?? metrics;
  const effective = stored?.effectiveKeystrokes ?? metrics.effective;
  const miss = stored?.missCount ?? metrics.miss;
  const raw = stored?.rawKeystrokes ?? metrics.raw;

  return (
    <section className="result-panel" aria-labelledby="result-title">
      <h2 id="result-title">{title(submission, t)}</h2>
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

      <p className="result-actions">
        {submission.kind === 'failed' && submission.canRetry && (
          <button className="ui-tab" type="button" onClick={onRetry}>
            {t('result.sendAgain')}
          </button>
        )}
        <button className="ui-btn" type="button" onClick={onPlayAgain}>
          {t('common.chooseLanguage')}
        </button>
      </p>
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
