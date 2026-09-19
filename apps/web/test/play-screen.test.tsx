// @vitest-environment jsdom
import type { StartSessionResponse } from '@typing-trainer/contracts';
import { IDLE_LIMIT_MS, PLAY_DURATION_MS } from '@typing-trainer/typing-engine';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PlayScreen } from '../src/features/play/PlayScreen';
import { useRunSession } from '../src/features/play/run-session';
import { IF_PROGRAM, PADDED_PROGRAM } from './program-fixture';

const ISSUED: StartSessionResponse = {
  sessionId: '22222222-2222-4222-8222-222222222222',
  language: 'python',
  mode: 'single',
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

beforeEach(() => {
  useRunSession.setState({ run: null });
});

afterEach(() => {
  cleanup();
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

  it('shows the score when the run is over, and offers another language', async () => {
    beginRun();
    renderScreen();

    // Finish both blocks: the run ends as soon as the last one is done (§4.1).
    // `{{` is how user-event types a literal brace, and `{Enter}` is the Enter key.
    await userEvent.type(typingInput(), 'if(a{{{Enter}b{Enter}');
    await userEvent.type(typingInput(), 'a: 1');

    expect(useRunSession.getState().run?.getSnapshot().endedBy).toBe('blocks');
    expect(screen.getByRole('heading', { name: 'Run over' })).toBeTruthy();
    expect(screen.queryAllByLabelText('Code to type')).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Choose a language' }));
    expect(await screen.findByText('choose a language')).toBeTruthy();
    expect(useRunSession.getState().run).toBeNull();
  });
});
