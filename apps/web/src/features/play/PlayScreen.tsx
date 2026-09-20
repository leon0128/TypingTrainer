import type { TypingProgram } from '@typing-trainer/contracts';
import { RUN_BLOCK_COUNT, type SessionState } from '@typing-trainer/typing-engine';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';

import { CodeView } from './CodeView';
import { formatSeconds } from './format';
import { attachKeyboardInput } from './keyboard-input';
import { buildLayout, type Layout } from './layout';
import { ResultPanel } from './ResultPanel';
import { useRunSession } from './run-session';
import { onRunClock, type RunPhase, type RunStore } from './run-store';
import './play.css';

const noSubscribe = () => () => undefined;
const noSnapshot = () => null;

export function PlayScreen() {
  const run = useRunSession((state) => state.run);
  // Nothing is kept across a reload, so a refreshed /play starts over from language selection;
  // the run the server issued is simply never submitted and expires (§9.8).
  if (run === null) return <Navigate to="/" replace />;
  return <RunView run={run} />;
}

function RunView({ run }: { run: RunStore }) {
  const navigate = useNavigate();
  const clear = useRunSession((state) => state.clear);
  const submission = useRunSession((state) => state.submission);
  const submit = useRunSession((state) => state.submit);
  const snapshot = useSyncExternalStore(run.subscribe, run.getSnapshot);
  const opponent = run.opponent;
  const opponentSession = useSyncExternalStore(
    opponent?.subscribe ?? noSubscribe,
    opponent?.getSnapshot ?? noSnapshot,
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const remainingRef = useRef<HTMLSpanElement>(null);
  const [focused, setFocused] = useState(false);
  const [imeActive, setImeActive] = useState(false);

  // One layout per block, built when the block is first shown rather than for all 20 at once.
  const layouts = useMemo(() => new Map<string, Layout>(), []);
  const layoutOf = (program: TypingProgram): Layout => {
    const existing = layouts.get(program.blockId);
    if (existing !== undefined) return existing;
    const built = buildLayout(program);
    layouts.set(program.blockId, built);
    return built;
  };

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const detach = attachKeyboardInput(input, {
      onKey(key, timeStamp) {
        run.press(key, onRunClock(timeStamp));
      },
      onImeChange: setImeActive,
      onBlur(now) {
        setFocused(false);
        run.pause(onRunClock(now));
      },
      onFocus(now) {
        setFocused(true);
        run.resume(onRunClock(now));
      },
    });
    input.focus();
    return detach;
  }, [run]);

  // The countdown repaints every frame by writing text directly, outside React rendering; the
  // same frame gives the store its clock, so the run ends on time and idle runs are discarded.
  useEffect(() => {
    const render = () => {
      if (remainingRef.current) {
        remainingRef.current.textContent = formatSeconds(run.remainingMs(performance.now()));
      }
    };
    render();
    if (snapshot.phase === 'ended') return;
    let frame = requestAnimationFrame(function tick() {
      run.tick(performance.now());
      render();
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [snapshot.phase, run]);

  // The run is submitted as soon as it ends; the store sends it once (§9.8).
  useEffect(() => {
    if (snapshot.phase === 'ended') void submit();
  }, [snapshot.phase, submit]);

  const focusInput = (event: MouseEvent) => {
    // Keep focus on the hidden input instead of letting the click blur it (and pause the run).
    event.preventDefault();
    inputRef.current?.focus();
  };

  const { session } = snapshot;
  const metrics = run.liveMetrics();
  const overlay = overlayText(snapshot.phase, focused, imeActive);

  return (
    <main className="play">
      <header className="play-header">
        <h1>TypingTrainer</h1>
        <span className="block-name">
          {run.issued.language}
          {opponent !== null && ` · vs ${opponent.label}`} · block{' '}
          {Math.min(session.blockIndex + 1, RUN_BLOCK_COUNT)} / {session.programs.length}
        </span>
        <span className="live-metrics">
          KPM {Math.round(metrics.kpm)} · ACC {Math.round(metrics.accuracy * 100)}% · SCORE{' '}
          {metrics.score}
        </span>
        <span className="stopwatch">
          Left <span ref={remainingRef}>0.0 s</span>
        </span>
      </header>

      <input
        ref={inputRef}
        className="hidden-input"
        aria-label="Typing input"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      <p className="status" role="status">
        {statusText(snapshot.phase)}
      </p>

      {snapshot.phase !== 'ended' && (
        <div className={opponent === null ? undefined : 'versus'}>
          <section className="column" aria-label="You">
            {opponent !== null && <h2 className="column-title">You</h2>}
            <BlockColumn
              session={session}
              layoutOf={layoutOf}
              missSeq={snapshot.missSeq}
              lastMiss={snapshot.lastMiss}
              overlay={overlay}
              onMouseDown={focusInput}
            />
          </section>
          {opponent !== null && opponentSession !== null && (
            <section className="column opponent-column" aria-label="Opponent">
              <h2 className="column-title">
                {opponent.label} · SCORE {opponent.liveMetrics().score}
              </h2>
              <BlockColumn
                session={opponentSession}
                layoutOf={layoutOf}
                missSeq={0}
                lastMiss={null}
                overlay={null}
                onMouseDown={focusInput}
              />
            </section>
          )}
        </div>
      )}

      {snapshot.phase === 'ended' && (
        <ResultPanel
          metrics={metrics}
          submission={submission}
          onRetry={() => void submit()}
          onPlayAgain={() => {
            clear();
            void navigate('/', { replace: true });
          }}
        />
      )}
    </main>
  );
}

interface BlockColumnProps {
  readonly session: SessionState;
  readonly layoutOf: (program: TypingProgram) => Layout;
  readonly missSeq: number;
  readonly lastMiss: { readonly atomIndex: number; readonly charIndex: number } | null;
  readonly overlay: string | null;
  readonly onMouseDown: (event: MouseEvent) => void;
}

/** The block being typed and the next one dimmed beside it (§8.1), for the player or the CPU. */
function BlockColumn({
  session,
  layoutOf,
  missSeq,
  lastMiss,
  overlay,
  onMouseDown,
}: BlockColumnProps) {
  const current = session.programs[session.blockIndex];
  const next = session.programs[session.blockIndex + 1];
  return (
    <>
      {current !== undefined && (
        <section className="code-panel" onMouseDown={onMouseDown}>
          <CodeView
            layout={layoutOf(current)}
            engine={session.block}
            missSeq={missSeq}
            lastMiss={lastMiss}
          />
          {overlay !== null && (
            <div className="overlay" role="alert">
              {overlay}
            </div>
          )}
        </section>
      )}
      {next !== undefined && (
        <section className="code-panel code-next" aria-label="Next block">
          <CodeView layout={layoutOf(next)} engine={null} missSeq={0} lastMiss={null} />
        </section>
      )}
    </>
  );
}

function statusText(phase: RunPhase): string {
  switch (phase) {
    case 'ready':
      return 'Start typing. The countdown starts with your first keystroke.';
    case 'playing':
      return 'Typing. Backspace is disabled; progress is forward-only.';
    case 'paused':
      return 'Paused.';
    case 'ended':
      return 'Run over.';
  }
}

function overlayText(phase: RunPhase, focused: boolean, imeActive: boolean): string | null {
  if (imeActive) return 'Turn off your IME (Japanese input) to type.';
  if (focused || phase === 'ended') return null;
  return phase === 'paused' ? 'Paused — click here to resume' : 'Click here to start';
}
