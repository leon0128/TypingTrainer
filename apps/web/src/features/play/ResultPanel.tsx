import type { OfficialMetrics } from '@typing-trainer/typing-engine';

import { formatPercent } from './format';
import type { RunEnd } from './run-store';

export interface ResultPanelProps {
  readonly metrics: OfficialMetrics;
  readonly endedBy: RunEnd | null;
  readonly onPlayAgain: () => void;
}

/**
 * What the run scored (F-04, §3.6). These are the official formulas, computed from the same
 * counters the server recomputes; submitting the run and showing what was stored follows.
 */
export function ResultPanel({ metrics, endedBy, onPlayAgain }: ResultPanelProps) {
  return (
    <section className="result-panel" aria-labelledby="result-title">
      <h2 id="result-title">{endedBy === 'idle' ? 'Run discarded' : 'Run over'}</h2>

      {endedBy === 'idle' ? (
        <p>This run sat idle for too long, so it is not saved (§4.1).</p>
      ) : (
        <dl>
          <dt>Score</dt>
          <dd>{metrics.score}</dd>

          <dt>KPM</dt>
          <dd>
            {metrics.kpm} <small>effective keystrokes ÷ 2 minutes</small>
          </dd>

          <dt>Accuracy</dt>
          <dd>
            {formatPercent(metrics.accuracy)}{' '}
            <small>miss rate {formatPercent(metrics.missRate)}</small>
          </dd>

          <dt>Keystrokes</dt>
          <dd>
            effective {metrics.effective} · miss {metrics.miss} · raw {metrics.raw}
          </dd>
        </dl>
      )}

      <button type="button" onClick={onPlayAgain}>
        Choose a language
      </button>
    </section>
  );
}
