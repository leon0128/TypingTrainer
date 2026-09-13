import { formatMs, formatPercent, formatSeconds } from './format';
import type { ReferenceResult } from './reference-metrics';

export function ResultPanel({
  result,
  onRestart,
}: {
  result: ReferenceResult;
  onRestart: () => void;
}) {
  return (
    <section className="result-panel" aria-labelledby="result-title">
      <h2 id="result-title">
        Reference results <span className="not-official">(not the official score)</span>
      </h2>
      <dl>
        <dt>Elapsed</dt>
        <dd>
          {formatSeconds(result.elapsedMs)}{' '}
          <small>from the first keystroke to block completion, pauses excluded</small>
        </dd>

        <dt>KPM (ref.)</dt>
        <dd>
          {Math.round(result.referenceKpm)} <small>effective keystrokes ÷ elapsed minutes</small>
        </dd>

        <dt>Accuracy</dt>
        <dd>{formatPercent(result.accuracy)}</dd>

        <dt>Keystrokes</dt>
        <dd>
          effective {result.effective} / canonical {result.canonical} · miss {result.miss} · raw{' '}
          {result.raw}
        </dd>

        <dt>Input latency</dt>
        <dd>
          max {formatMs(result.latency.maxMs)} · p95 {formatMs(result.latency.p95Ms)}{' '}
          <small>
            keydown to next animation frame, {result.latency.samples} samples; G1 target is 33 ms
          </small>
        </dd>
      </dl>
      <p className="footnote">
        The 120-second run and the official KPM and score formulas (§3.6) arrive in P1.
      </p>
      <button type="button" onClick={onRestart}>
        Restart
      </button>
    </section>
  );
}
