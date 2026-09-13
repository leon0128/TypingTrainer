import type { TypingProgram } from '@typing-trainer/contracts';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';

import { CodeView } from './CodeView';
import { formatSeconds } from './format';
import { attachKeyboardInput } from './keyboard-input';
import { buildLayout } from './layout';
import { createPlayStore, type PlayPhase } from './play-store';
import { ResultPanel } from './ResultPanel';
import './play.css';

export function PlayScreen({ program }: { program: TypingProgram }) {
  const store = useMemo(() => createPlayStore(program), [program]);
  const layout = useMemo(() => buildLayout(program), [program]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);

  const inputRef = useRef<HTMLInputElement>(null);
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const [focused, setFocused] = useState(false);
  const [imeActive, setImeActive] = useState(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const detach = attachKeyboardInput(input, {
      onKey(key, timeStamp) {
        store.press(key, timeStamp);
        // Key press to the next animation frame (G1 targets paint within 33 ms).
        requestAnimationFrame(() => {
          store.recordLatency(performance.now() - timeStamp);
        });
      },
      onImeChange: setImeActive,
      onBlur(now) {
        setFocused(false);
        store.pause(now);
      },
      onFocus(now) {
        setFocused(true);
        store.resume(now);
      },
    });
    input.focus();
    return detach;
  }, [store]);

  // The stopwatch repaints every frame by writing text directly, outside React rendering.
  useEffect(() => {
    const render = () => {
      if (elapsedRef.current) {
        elapsedRef.current.textContent = formatSeconds(store.elapsedMs(performance.now()));
      }
    };
    render();
    if (snapshot.phase !== 'playing') return;
    let frame = requestAnimationFrame(function tick() {
      render();
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [snapshot.phase, store]);

  const focusInput = (event: MouseEvent) => {
    // Keep focus on the hidden input instead of letting the click blur it (and pause the run).
    event.preventDefault();
    inputRef.current?.focus();
  };
  const restart = () => {
    store.restart();
    inputRef.current?.focus();
  };

  const overlay = overlayText(snapshot.phase, focused, imeActive);

  return (
    <main className="play">
      <p className="preview-banner" role="note">
        P0 engine preview — measurements on this page are for reference only, not the official
        score.
      </p>

      <header className="play-header">
        <h1>TypingTrainer</h1>
        <span className="block-name">TypeScript · {program.blockId}</span>
        <span className="stopwatch">
          Elapsed <span ref={elapsedRef}>0.0 s</span>
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

      <section className="code-panel" onMouseDown={focusInput}>
        <CodeView layout={layout} snapshot={snapshot} />
        {overlay !== null && (
          <div className="overlay" role="alert">
            {overlay}
          </div>
        )}
      </section>

      {snapshot.result && <ResultPanel result={snapshot.result} onRestart={restart} />}
    </main>
  );
}

function statusText(phase: PlayPhase): string {
  switch (phase) {
    case 'ready':
      return 'Start typing. The stopwatch starts on your first keystroke.';
    case 'playing':
      return 'Typing. Backspace is disabled; progress is forward-only.';
    case 'paused':
      return 'Paused.';
    case 'finished':
      return 'Block complete.';
  }
}

function overlayText(phase: PlayPhase, focused: boolean, imeActive: boolean): string | null {
  if (imeActive) return 'Turn off your IME (Japanese input) to type.';
  if (focused || phase === 'finished') return null;
  return phase === 'paused' ? 'Paused — click here to resume' : 'Click here to start';
}
