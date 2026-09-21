import { trackOf, type ContentLanguage, type TypingProgram } from '@typing-trainer/contracts';
import { PLAY_DURATION_MS, type SessionState } from '@typing-trainer/typing-engine';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';

import { useTranslation } from '../../i18n';
import { soundPlayer } from '../sound/sound';
import { CodeView } from './CodeView';
import { JaView } from './JaView';
import { lookahead } from './lookahead';
import { languageLabel } from '../tracks/tracks';
import { formatSeconds } from './format';
import { attachKeyboardInput } from './keyboard-input';
import { buildLayout, type Layout } from './layout';
import { ResultPanel } from './ResultPanel';
import { useRunSession } from './run-session';
import { onRunClock, type RunPhase, type RunStore } from './run-store';
import './play.css';
import { Icon } from '../../components/Icon';
import { usePlayLook } from '../appearance/use-play-look';
import { useLeaveGuard } from '../nav/leave-guard';

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
  const { t } = useTranslation();
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
  const [capsLock, setCapsLock] = useState(false);
  const track = trackOf(run.issued.language);
  const look = usePlayLook(track);

  // One layout per block, built when the block is first shown rather than for all 20 at once.
  const layouts = useMemo(() => new Map<string, Layout>(), []);
  const layoutOf = (program: TypingProgram): Layout => {
    const existing = layouts.get(program.blockId);
    if (existing !== undefined) return existing;
    const built = buildLayout(program);
    layouts.set(program.blockId, built);
    return built;
  };

  // Ready the key sounds before the first key, when the player has already clicked to get here.
  useEffect(() => {
    soundPlayer.prepare();
  }, [run]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const detach = attachKeyboardInput(input, {
      onKey(key, timeStamp) {
        const verdict = run.press(key, onRunClock(timeStamp));
        // Sounded here, in the key handler, before React has rendered anything, so the sound
        // follows the key by as little as the browser allows (§8.3, §9.6). Only the player's own
        // keys sound; keys the engine ignored, or that came after the run ended, are silent.
        if (verdict === 'CORRECT') soundPlayer.play('hit');
        else if (verdict === 'MISS') soundPlayer.play('miss');
      },
      onImeChange: setImeActive,
      onCapsLock: setCapsLock,
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

  // While the run is on, the header asks before it takes the player away; the run would be lost.
  const setLeaveGuard = useLeaveGuard((state) => state.set);
  const running = snapshot.phase !== 'ended';
  useEffect(() => {
    setLeaveGuard(running ? t('play.confirmLeave') : null);
    return () => {
      setLeaveGuard(null);
    };
  }, [running, setLeaveGuard, t]);

  const focusInput = (event: MouseEvent) => {
    // Keep focus on the hidden input instead of letting the click blur it (and pause the run).
    event.preventDefault();
    inputRef.current?.focus();
  };

  const { session } = snapshot;
  const metrics = run.liveMetrics();
  const overlay = overlayText(snapshot.phase, focused, imeActive, t);

  return (
    <main className="play" data-track={track} data-preset={look.preset} style={look.style}>
      <header className="play-header">
        <span className="block-name">
          {languageLabel(t, run.issued.language, run.issued.language)}
          {opponent !== null && ` · ${t('play.versus', { opponent: opponent.label })}`} ·{' '}
          {t('play.block', {
            current: Math.min(session.blockIndex + 1, session.programs.length),
            total: session.programs.length,
          })}
        </span>
        <span className="live-metrics">
          {t('play.liveMetrics', {
            kpm: Math.round(metrics.kpm),
            accuracy: Math.round(metrics.accuracy * 100),
            score: metrics.score,
          })}
        </span>
        <span className="stopwatch">
          <Icon name="timer" className="ui-icon" /> {t('play.left')}{' '}
          <span ref={remainingRef}>{formatSeconds(PLAY_DURATION_MS)}</span>
        </span>
      </header>

      <input
        ref={inputRef}
        className="hidden-input"
        aria-label={t('play.typingInput')}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      <p className="status" role="status">
        {statusText(snapshot.phase, t)}
      </p>
      {capsLock && track !== 'code' && (
        <p className="caps-warning" role="alert">
          {t('play.capsLock')}
        </p>
      )}

      {snapshot.phase !== 'ended' && (
        <div className={opponent === null ? undefined : 'versus'}>
          <section className="column" aria-label={t('play.you')}>
            {opponent !== null && <h2 className="column-title">{t('play.you')}</h2>}
            <BlockColumn
              session={session}
              language={run.issued.language}
              layoutOf={layoutOf}
              missSeq={snapshot.missSeq}
              lastMiss={snapshot.lastMiss}
              overlay={overlay}
              onMouseDown={focusInput}
            />
          </section>
          {opponent !== null && opponentSession !== null && (
            <section className="column opponent-column" aria-label={t('play.opponentGroup')}>
              <h2 className="column-title">
                {t('play.opponentScore', {
                  opponent: opponent.label,
                  score: opponent.liveMetrics().score,
                })}
              </h2>
              <BlockColumn
                session={opponentSession}
                language={run.issued.language}
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
  readonly language: ContentLanguage;
  readonly layoutOf: (program: TypingProgram) => Layout;
  readonly missSeq: number;
  readonly lastMiss: { readonly atomIndex: number; readonly charIndex: number } | null;
  readonly overlay: string | null;
  readonly onMouseDown: (event: MouseEvent) => void;
}

/** The block being typed and the next one dimmed beside it (§8.1), for the player or the CPU. */
function BlockColumn({
  session,
  language,
  layoutOf,
  missSeq,
  lastMiss,
  overlay,
  onMouseDown,
}: BlockColumnProps) {
  const { t } = useTranslation();
  const current = session.programs[session.blockIndex];
  const upcoming = session.programs.slice(
    session.blockIndex + 1,
    session.blockIndex + 1 + lookahead(language),
  );
  const ja = trackOf(language) === 'natural-ja';
  const wrap = trackOf(language) === 'natural-en';
  return (
    <>
      {current !== undefined && (
        <section className="code-panel" onMouseDown={onMouseDown}>
          {ja ? (
            <JaView
              program={current}
              engine={session.block}
              missSeq={missSeq}
              lastMiss={lastMiss}
            />
          ) : (
            <CodeView
              layout={layoutOf(current)}
              engine={session.block}
              missSeq={missSeq}
              lastMiss={lastMiss}
              wrap={wrap}
            />
          )}
          {overlay !== null && (
            <div className="overlay" role="alert">
              {overlay}
            </div>
          )}
        </section>
      )}
      {upcoming.map((program) => (
        <section
          key={program.blockId}
          className="code-panel code-next"
          aria-label={t('play.nextBlock')}
        >
          {ja ? (
            <JaView program={program} engine={null} missSeq={0} lastMiss={null} />
          ) : (
            <CodeView
              layout={layoutOf(program)}
              engine={null}
              missSeq={0}
              lastMiss={null}
              wrap={wrap}
            />
          )}
        </section>
      ))}
    </>
  );
}

function statusText(phase: RunPhase, t: TFunction): string {
  switch (phase) {
    case 'ready':
      return t('play.statusReady');
    case 'playing':
      return t('play.statusPlaying');
    case 'paused':
      return t('play.statusPaused');
    case 'ended':
      return t('play.statusEnded');
  }
}

function overlayText(
  phase: RunPhase,
  focused: boolean,
  imeActive: boolean,
  t: TFunction,
): string | null {
  if (imeActive) return t('play.overlayIme');
  if (focused || phase === 'ended') return null;
  return phase === 'paused' ? t('play.overlayResume') : t('play.overlayStart');
}
