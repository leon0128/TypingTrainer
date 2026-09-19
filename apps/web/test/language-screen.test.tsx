// @vitest-environment jsdom
import { PLAY_DURATION_MS, IDLE_LIMIT_MS } from '@typing-trainer/typing-engine';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../src/features/auth/auth-store';
import { LanguageScreen } from '../src/features/languages/LanguageScreen';
import { useRunSession } from '../src/features/play/run-session';
import { IF_PROGRAM } from './program-fixture';

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'ada',
  timezone: 'UTC',
  locale: 'en',
};

const LANGUAGES = {
  languages: [
    { slug: 'python', displayName: 'Python' },
    { slug: 'go', displayName: 'Go' },
  ],
};

const ISSUED = {
  sessionId: '22222222-2222-4222-8222-222222222222',
  language: 'python',
  mode: 'single',
  seed: '7',
  contentRevision: 'b'.repeat(64),
  blocks: [IF_PROGRAM],
  durationMs: PLAY_DURATION_MS,
  idleLimitMs: IDLE_LIMIT_MS,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LanguageScreen />} />
        <Route path="/play" element={<p>playing</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuthStore.setState({ status: 'signed-in', user: USER, startupError: null });
  useRunSession.setState({ run: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('language screen', () => {
  it('offers the languages the server has content for', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(json(LANGUAGES)));
    renderScreen();
    expect(await screen.findByRole('button', { name: 'Python' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go' })).toBeTruthy();
  });

  it('starts a run for the language that was picked and goes to the play screen', async () => {
    const requests: { url: string; body?: string }[] = [];
    vi.stubGlobal('fetch', (url: string, init: { body?: string } = {}) => {
      requests.push({ url, ...(init.body === undefined ? {} : { body: init.body }) });
      return Promise.resolve(url.endsWith('/languages') ? json(LANGUAGES) : json(ISSUED, 201));
    });

    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'Go' }));

    await screen.findByText('playing');
    expect(requests[1]?.url).toBe('/api/play/sessions');
    expect(JSON.parse(requests[1]?.body ?? '{}')).toEqual({ language: 'go', mode: 'single' });
    expect(useRunSession.getState().run?.issued.sessionId).toBe(ISSUED.sessionId);
  });

  it('keeps the player here and says why when the run could not be started', async () => {
    vi.stubGlobal('fetch', (url: string) =>
      Promise.resolve(
        url.endsWith('/languages')
          ? json(LANGUAGES)
          : json({ statusCode: 429, error: 'Too Many Requests', message: 'too many runs' }, 429),
      ),
    );

    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'Python' }));

    expect((await screen.findByRole('alert')).textContent).toBe('too many runs');
    expect(useRunSession.getState().run).toBeNull();
    // The button is usable again, so the player can retry.
    expect(screen.getByRole('button', { name: 'Python' })).toBeTruthy();
  });

  it('reports a language list that could not be loaded', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    renderScreen();
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be reached/);
  });
});
