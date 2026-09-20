import type { PlayRun } from '@typing-trainer/contracts';
import type { OfficialMetrics } from '@typing-trainer/typing-engine';

import { formatPercent } from './format';
import { GHOST_PERIOD_LABELS } from './opponent';
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
  const stored = submission.kind === 'saved' ? submission.run : null;
  const shown = stored ?? metrics;
  const effective = stored?.effectiveKeystrokes ?? metrics.effective;
  const miss = stored?.missCount ?? metrics.miss;
  const raw = stored?.rawKeystrokes ?? metrics.raw;

  return (
    <section className="result-panel" aria-labelledby="result-title">
      <h2 id="result-title">{title(submission)}</h2>
      <p className="submission" role="status">
        {statusLine(submission)}
      </p>
      {stored?.result != null && (
        <p className="match-result">
          {opponentName(stored)} scored {stored.opponentScore}; you scored {stored.score}.{' '}
          {stored.result === 'win' ? 'A tie counts as a win.' : ''}
        </p>
      )}

      {submission.kind !== 'discarded' && submission.kind !== 'empty' && (
        <dl>
          <dt>Score</dt>
          <dd>{shown.score}</dd>

          <dt>KPM</dt>
          <dd>
            {shown.kpm} <small>effective keystrokes ÷ 2 minutes</small>
          </dd>

          <dt>Accuracy</dt>
          <dd>
            {formatPercent(shown.accuracy)}{' '}
            <small>miss rate {formatPercent(1 - shown.accuracy)}</small>
          </dd>

          <dt>Keystrokes</dt>
          <dd>
            effective {effective} · miss {miss} · raw {raw}
          </dd>
        </dl>
      )}

      <p className="result-actions">
        {submission.kind === 'failed' && submission.canRetry && (
          <button type="button" onClick={onRetry}>
            Send again
          </button>
        )}
        <button type="button" onClick={onPlayAgain}>
          Choose a language
        </button>
      </p>
    </section>
  );
}

/** Who the player raced, as the stored run names them. */
function opponentName(run: PlayRun): string {
  if (run.cpuLevel !== null) return `CPU Lv.${String(run.cpuLevel)}`;
  return run.ghostPeriod === null
    ? 'The opponent'
    : `Ghost (${GHOST_PERIOD_LABELS[run.ghostPeriod]})`;
}

function title(submission: Submission): string {
  switch (submission.kind) {
    case 'discarded':
      return 'Run discarded';
    case 'empty':
      return 'Nothing typed';
    case 'saved':
      if (submission.run.result === 'win') return 'You won';
      if (submission.run.result === 'lose') return 'You lost';
      return 'Run saved';
    default:
      return 'Run over';
  }
}

function statusLine(submission: Submission): string {
  switch (submission.kind) {
    case 'unsent':
    case 'sending':
      return 'Saving this run…';
    case 'saved':
      return `Saved as your run for ${submission.run.localDate}.`;
    case 'empty':
      return 'No keystroke was recorded, so nothing was saved.';
    case 'discarded':
      return 'This run sat idle past the limit, so it was not saved (§4.1).';
    case 'failed':
      return submission.message;
  }
}
