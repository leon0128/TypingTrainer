// @vitest-environment jsdom
import type { StartSessionResponse } from '@typing-trainer/contracts';
import { IDLE_LIMIT_MS, PLAY_DURATION_MS } from '@typing-trainer/typing-engine';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { soundPlayer } from '../src/features/sound/sound';
import { PlayScreen } from '../src/features/play/PlayScreen';
import { useRunSession } from '../src/features/play/run-session';
import { IF_PROGRAM, PADDED_PROGRAM } from './program-fixture';

const ISSUED: StartSessionResponse = {
  sessionId: '22222222-2222-4222-8222-222222222222',
  language: 'python',
  mode: 'single',
  cpuLevel: null,
  ghostPeriod: null,
  ghostScore: null,
  seed: '7',
  contentRevision: 'b'.repeat(64),
  blocks: [IF_PROGRAM, PADDED_PROGRAM],
  durationMs: PLAY_DURATION_MS,
  idleLimitMs: IDLE_LIMIT_MS,
};

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/play']}>
      <Routes>
        <Route path="/play" element={<PlayScreen />} />
        <Route path="/" element={<p>choose a language</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The typing input is hidden from the accessibility tree helpers by design; find it by label. */
const typingInput = () => screen.getByLabelText('Typing input');

/** Starts a run now: idle is measured from the issue time against the same clock (§4.1). */
const beginRun = () => {
  useRunSession.getState().begin(ISSUED, performance.now());
};

/**
 * Deliberately unlike anything the fixture run could produce: the screen must show what the
 * server stored, not what the client counted (§9.8).
 */
const STORED = {
  id: '33333333-3333-4333-8333-333333333333',
  language: 'python',
  mode: 'single',
  cpuLevel: null,
  ghostPeriod: null,
  startedAt: '2026-09-20T01:00:00.000Z',
  localDate: '2026-09-20',
  effectiveKeystrokes: 123,
  missCount: 4,
  rawKeystrokes: 111,
  kpm: 61.5,
  accuracy: 0.9688,
  score: 60,
  opponentScore: null,
  result: null,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Types both issued blocks correctly, which ends the run (§4.1). */
async function finishTheRun() {
  // `{{` is how user-event types a literal brace, and `{Enter}` is the Enter key.
  await userEvent.type(typingInput(), 'if(a{{{Enter}b{Enter}');
  await userEvent.type(typingInput(), 'a: 1');
}

beforeEach(() => {
  useRunSession.setState({ run: null, submission: { kind: 'unsent' } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('play screen', () => {
  it('sends the player back to language selection when there is no run', async () => {
    renderScreen();
    expect(await screen.findByText('choose a language')).toBeTruthy();
  });

  it('shows the block being typed and the next one, with the run position', () => {
    beginRun();
    renderScreen();

    expect(screen.getByText(/python · block 1 \/ 2/)).toBeTruthy();
    const panels = screen.getAllByLabelText('Code to type');
    expect(panels).toHaveLength(2);
    expect(panels[0]?.textContent).toContain('if (a)');
    expect(panels[1]?.textContent).toContain('a:');
    // The next block is a preview: no caret sits on it and nothing on it reads as typed.
    expect(panels[1]?.querySelector('.cell-cursor')).toBeNull();
    expect(panels[1]?.querySelector('.cell-typed')).toBeNull();
    // The block being typed has both, once a key has been pressed.
    expect(panels[0]?.querySelector('.cell-cursor')).not.toBeNull();
  });

  it('types into the run and moves the caret through the block', async () => {
    beginRun();
    renderScreen();

    await userEvent.type(typingInput(), 'if(a');
    const run = useRunSession.getState().run;
    expect(run?.getSnapshot().session.block?.counters.effective).toBeGreaterThan(0);
    expect(run?.buildLog().keys).toBe('if(a');
  });

  it('counts a wrong key as a miss and keeps the run going', async () => {
    beginRun();
    renderScreen();

    await userEvent.type(typingInput(), 'ix');
    const snapshot = useRunSession.getState().run?.getSnapshot();
    expect(snapshot?.missSeq).toBe(1);
    expect(snapshot?.phase).toBe('playing');
  });

  it('submits the run when it ends and shows what the server stored', async () => {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal('fetch', (url: string, init: { body?: string } = {}) => {
      calls.push({ url, body: init.body ?? '' });
      return Promise.resolve(json({ run: STORED }, 201));
    });

    beginRun();
    renderScreen();
    await finishTheRun();

    expect(useRunSession.getState().run?.getSnapshot().endedBy).toBe('blocks');
    expect(await screen.findByRole('heading', { name: 'Run saved' })).toBeTruthy();
    expect(screen.queryAllByLabelText('Code to type')).toHaveLength(0);
    expect(calls[0]?.url).toContain('/result');

    // The server's numbers are the ones shown, not the client's own count.
    const panel = screen.getByLabelText('Run saved').textContent;
    expect(panel).toContain(String(STORED.score));
    expect(panel).toContain(String(STORED.kpm));
    expect(panel).toContain(String(STORED.effectiveKeystrokes));
    // The day, written as English writes a date.
    expect(panel).toContain('September 20, 2026');
    const counted = useRunSession.getState().run?.liveMetrics();
    expect(counted?.score).not.toBe(STORED.score);
    expect(panel).not.toContain(`Score${String(counted?.score)}`);

    await userEvent.click(screen.getByRole('button', { name: 'Choose a language' }));
    expect(await screen.findByText('choose a language')).toBeTruthy();
    expect(useRunSession.getState().run).toBeNull();
  });

  it('shows why the server refused a result, with no way to send it again', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        json(
          { statusCode: 422, error: 'Unprocessable Entity', message: 'result rejected: speed' },
          422,
        ),
      ),
    );

    beginRun();
    renderScreen();
    await finishTheRun();

    expect(
      await screen.findByText('result rejected: the typing speed was implausibly high'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send again' })).toBeNull();
  });

  it('offers to send the result again when the request never reached the server', async () => {
    let attempt = 0;
    vi.stubGlobal('fetch', () => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(json({ run: STORED }, 201));
    });

    beginRun();
    renderScreen();
    await finishTheRun();

    await userEvent.click(await screen.findByRole('button', { name: 'Send again' }));
    expect(await screen.findByRole('heading', { name: 'Run saved' })).toBeTruthy();
    expect(attempt).toBe(2);
  });
});

describe('vs CPU', () => {
  const CPU_ISSUED = { ...ISSUED, mode: 'cpu' as const, cpuLevel: 50 };

  it('shows the CPU beside the player, each with its own current and next block', () => {
    useRunSession.getState().begin(CPU_ISSUED, performance.now());
    renderScreen();

    expect(screen.getByText(/vs CPU Lv\.50/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'You' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /CPU Lv\.50 · SCORE 0/ })).toBeTruthy();
    expect(screen.getAllByLabelText('Code to type')).toHaveLength(4);
    const cpu = screen.getByLabelText('Opponent');
    expect(cpu.querySelector('.cell-cursor')).not.toBeNull();
  });

  it('shows no opponent in single play', () => {
    beginRun();
    renderScreen();
    expect(screen.queryByLabelText('Opponent')).toBeNull();
    expect(screen.getAllByLabelText('Code to type')).toHaveLength(2);
  });

  it.each([
    ['win', 'You won', /CPU Lv\.50 scored 70; you scored 88\. A tie counts as a win\./],
    ['lose', 'You lost', /CPU Lv\.50 scored 70; you scored 88\./],
  ] as const)('shows the server-judged result: %s', async (result, heading, line) => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        json(
          {
            run: {
              ...STORED,
              mode: 'cpu',
              cpuLevel: 50,
              ghostPeriod: null,
              ghostScore: null,
              opponentScore: 70,
              score: 88,
              result,
            },
          },
          201,
        ),
      ),
    );
    useRunSession.getState().begin(CPU_ISSUED, performance.now());
    renderScreen();
    await finishTheRun();

    expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
    const text = document.querySelector('.match-result')?.textContent ?? '';
    expect(text).toMatch(line);
    if (result === 'lose') expect(text).not.toMatch(/tie/);
  });
});

describe('a Ghost run', () => {
  const GHOST_ISSUED = {
    ...ISSUED,
    mode: 'ghost' as const,
    cpuLevel: null,
    ghostPeriod: 'daily' as const,
    ghostScore: 88,
  };

  it('shows the Ghost beside the player, named for its record', () => {
    useRunSession.getState().begin(GHOST_ISSUED, performance.now());
    renderScreen();

    expect(screen.getByText(/vs Ghost · today's best 88/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Ghost · today's best 88 · SCORE 0/ })).toBeTruthy();
    expect(screen.getAllByLabelText('Code to type')).toHaveLength(4);
  });

  it.each([
    ['win', 'You won', /Ghost \(today's best\) scored 88; you scored 91\. A tie counts as a win\./],
    ['lose', 'You lost', /Ghost \(today's best\) scored 88; you scored 91\./],
  ] as const)('shows the server-judged result: %s', async (result, heading, line) => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        json(
          {
            run: {
              ...STORED,
              mode: 'ghost',
              cpuLevel: null,
              ghostPeriod: 'daily',
              opponentScore: 88,
              score: 91,
              result,
            },
          },
          201,
        ),
      ),
    );
    useRunSession.getState().begin(GHOST_ISSUED, performance.now());
    renderScreen();
    await finishTheRun();

    expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
    const text = document.querySelector('.match-result')?.textContent ?? '';
    expect(text).toMatch(line);
    if (result === 'lose') expect(text).not.toMatch(/tie/);
  });
});

describe('key sounds on the play screen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gets the sounds ready as soon as the play screen opens, before any key', () => {
    const prepare = vi.spyOn(soundPlayer, 'prepare').mockImplementation(() => undefined);
    beginRun();
    renderScreen();
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('sounds a hit for a correct key and a miss for a wrong one', async () => {
    const play = vi.spyOn(soundPlayer, 'play').mockImplementation(() => undefined);
    beginRun();
    renderScreen();

    await userEvent.type(typingInput(), 'ix');
    // "i" is right; "x" is not the "f" that follows.
    expect(play.mock.calls).toEqual([['hit'], ['miss']]);
  });

  it('is silent for keys the engine does not count', async () => {
    const play = vi.spyOn(soundPlayer, 'play').mockImplementation(() => undefined);
    beginRun();
    renderScreen();

    await userEvent.type(typingInput(), '{Shift}{Backspace}{ArrowLeft}');
    expect(play).not.toHaveBeenCalled();
  });

  it('sounds each key once, at the key, and not for the opponent', async () => {
    const play = vi.spyOn(soundPlayer, 'play').mockImplementation(() => undefined);
    useRunSession
      .getState()
      .begin(
        { ...ISSUED, mode: 'cpu', cpuLevel: 100, ghostPeriod: null, ghostScore: null },
        performance.now(),
      );
    renderScreen();
    await userEvent.type(typingInput(), 'if(a');
    // Four keys, four sounds: the level-100 CPU typing beside the player adds none.
    expect(play).toHaveBeenCalledTimes(4);
  });

  it('stays silent once the run has ended', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(json({ run: STORED }, 201)));
    const play = vi.spyOn(soundPlayer, 'play').mockImplementation(() => undefined);
    beginRun();
    renderScreen();
    await finishTheRun();
    await screen.findByRole('heading', { name: 'Run saved' });
    const played = play.mock.calls.length;
    await userEvent.keyboard('zzz');
    expect(play.mock.calls.length).toBe(played);
  });
});
