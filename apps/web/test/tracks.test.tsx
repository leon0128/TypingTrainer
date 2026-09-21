// @vitest-environment jsdom
import type { Language, Track } from '@typing-trainer/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/app';
import { useAuthStore } from '../src/features/auth/auth-store';
import { ConquestsScreen } from '../src/features/conquests/ConquestsScreen';
import { DashboardScreen } from '../src/features/dashboard/DashboardScreen';
import { HistoryScreen } from '../src/features/history/HistoryScreen';
import { RankingsScreen } from '../src/features/rankings/RankingsScreen';
import { useLanguageStore } from '../src/features/tracks/language-store';
import { TrackLayout } from '../src/features/tracks/TrackLayout';
import { TrackStartScreen } from '../src/features/tracks/TrackStartScreen';
import { TRACK_SEGMENTS, trackOfSegment, trackPath } from '../src/features/tracks/tracks';
import { TrackContext } from '../src/features/tracks/use-track';

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'ada',
  displayName: null,
  timezone: 'UTC',
  locale: 'en' as const,
};

const lang = (slug: string, displayName: string, track: Track, kind: Language['kind']): Language =>
  ({ slug, displayName, track, kind }) as Language;
const PYTHON = lang('python', 'Python', 'code', null);
const GO = lang('go', 'Go', 'code', null);
const EN_WORD = lang('en-word', 'English words', 'natural-en', 'word');
const EN_LINE = lang('en-line', 'English sentences', 'natural-en', 'line');
const EN_PARAGRAPH = lang('en-paragraph', 'English paragraphs', 'natural-en', 'paragraph');
const JA_WORD = lang('ja-word', 'Japanese words', 'natural-ja', 'word');
const ALL = [PYTHON, GO, EN_WORD, EN_LINE, EN_PARAGRAPH, JA_WORD];

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

/** Answers each API path with what it is given, and records the URLs asked. */
function serve(languages: readonly Language[], extra: Record<string, unknown> = {}) {
  const urls: string[] = [];
  const answers: Record<string, unknown> = {
    '/languages': { languages },
    '/ratings': {
      languages: languages.map((l) => ({
        language: l.slug,
        displayName: l.displayName,
        rating: 0,
        gamesPlayed: 0,
      })),
    },
    '/ghost-records': { languages: [] },
    '/history': { entries: [], page: 1, pageSize: 20, total: 0 },
    '/cpu-conquests': { languages: [] },
    '/auth/me': { user: USER },
    '/preferences': {
      font: 'jetbrains-mono',
      fontSize: 18,
      theme: 'light',
      colorPreset: 'standard',
      skin: 'classic',
      soundPack: 'off',
      soundVolume: 30,
      timezone: 'UTC',
      locale: 'en',
    },
    ...extra,
  };
  vi.stubGlobal('fetch', (url: string) => {
    urls.push(url);
    const path = new URL(url, 'http://localhost').pathname.replace(/^\/api/, '');
    if (path === '/rankings')
      return Promise.resolve(json({ period: 'daily', language: 'x', entries: [] }));
    if (path === '/dashboard') {
      const language = new URL(url, 'http://localhost').searchParams.get('language');
      return Promise.resolve(
        json({
          period: 'weekly',
          language,
          from: null,
          to: null,
          points: [],
          summary: {
            totalRuns: 0,
            totalKeystrokes: 0,
            bestScores: [],
            highestCpuLevelBeaten: null,
          },
        }),
      );
    }
    return Promise.resolve(json(answers[path] ?? {}));
  });
  return urls;
}

function inTrack(track: Track, ui: ReactElement, path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TrackContext.Provider value={track}>
        <Routes>
          <Route path="/" element={ui} />
        </Routes>
      </TrackContext.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuthStore.setState({ status: 'signed-in', user: USER, startupError: null });
});

afterEach(() => {
  cleanup();
  useLanguageStore.getState().reset();
  vi.unstubAllGlobals();
  document.title = '';
});

describe('the tracks in a URL', () => {
  it('writes each track as code, ja, or en', () => {
    expect(TRACK_SEGMENTS).toEqual({ code: 'code', 'natural-ja': 'ja', 'natural-en': 'en' });
    expect(trackOfSegment('ja')).toBe('natural-ja');
    expect(trackOfSegment('en')).toBe('natural-en');
    expect(trackOfSegment('code')).toBe('code');
    for (const other of [undefined, '', 'natural-ja', 'JA', 'play', 'rankings']) {
      expect(trackOfSegment(other)).toBeNull();
    }
  });

  it('builds the path of a track and of a screen under it', () => {
    expect(trackPath('code')).toBe('/code');
    expect(trackPath('natural-ja', 'rankings')).toBe('/ja/rankings');
    expect(trackPath('natural-en', 'history')).toBe('/en/history');
  });
});

describe('the layout of a track', () => {
  function renderAt(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<p>home page</p>} />
          <Route path=":track" element={<TrackLayout />}>
            <Route index element={<p>start page</p>} />
            <Route path="rankings" element={<p>rankings page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  it('shows the screens of the track, in its colour, and the screen', () => {
    useLanguageStore.setState({ languages: [PYTHON, EN_WORD], error: null });
    const { container } = renderAt('/en/rankings');
    expect(screen.getByText('rankings page')).toBeTruthy();
    expect(container.querySelector('.track-layout')?.getAttribute('data-track')).toBe('natural-en');
    const nav = within(screen.getByRole('navigation', { name: 'Tracks' }));
    expect(nav.getByText('English')).toBeTruthy();
    expect(
      nav.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Play', '/en'],
      ['CPU battles', '/en/conquests'],
      ['High scores', '/en/rankings'],
      ['Status', '/en/dashboard'],
      ['Play log', '/en/history'],
    ]);
    expect(nav.getByRole('link', { name: 'High scores' }).className).toContain('active');
    expect(nav.getByRole('link', { name: 'Status' }).className).not.toContain('active');
  });

  it('sends the account back home from a track it may not use', () => {
    useLanguageStore.setState({ languages: [PYTHON, EN_WORD], error: null });
    renderAt('/ja');
    expect(screen.getByText('home page')).toBeTruthy();
    expect(screen.queryByText('start page')).toBeNull();
  });

  it('sends it home from a track that does not exist', () => {
    useLanguageStore.setState({ languages: [PYTHON, EN_WORD], error: null });
    renderAt('/nope');
    expect(screen.getByText('home page')).toBeTruthy();
  });

  it('waits for the languages before deciding', () => {
    useLanguageStore.setState({ languages: null, error: null });
    renderAt('/en');
    expect(screen.getByRole('status').textContent).toBe('Loading…');
    expect(screen.queryByText('home page')).toBeNull();
  });

  it('lets the account use Japanese when the server lists it', () => {
    useLanguageStore.setState({ languages: ALL, error: null });
    renderAt('/ja');
    expect(screen.getByText('start page')).toBeTruthy();
    expect(screen.getByText('Japanese')).toBeTruthy();
  });
});

describe('the whole app, in a track', () => {
  function renderApp(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    );
  }

  it('takes the old addresses to the code track', async () => {
    serve([PYTHON, GO, EN_WORD]);
    renderApp('/rankings');
    expect(await screen.findByRole('heading', { name: 'High scores' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Python' })).toBeTruthy();
    expect(document.title).toBe('Typing Trainer - High scores');
    const tracks = within(screen.getByRole('group', { name: 'Tracks' }));
    expect(tracks.getByRole('link', { name: 'Code' }).getAttribute('aria-current')).toBe('page');
  });

  it('does not offer, or open, the Japanese track to an account that is not Japanese', async () => {
    serve([PYTHON, EN_WORD]);
    renderApp('/ja');
    const tracks = within(await screen.findByRole('group', { name: 'Tracks' }));
    expect(tracks.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Code',
      'English',
    ]);
    expect(screen.queryByText('日本語')).toBeNull();
    expect(screen.queryByText('Japanese')).toBeNull();
  });

  it('opens the English track with its own pools', async () => {
    serve([PYTHON, EN_WORD, EN_LINE, EN_PARAGRAPH]);
    renderApp('/en');
    expect(await screen.findByRole('button', { name: /^Words/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Sentences/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Paragraphs/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Python/ })).toBeNull();
  });
});

describe('each screen shows one track', () => {
  it("starts a run in a pool of the track, named by its kind, and hints the track's CPU speed", async () => {
    serve(ALL);
    inTrack('natural-en', <TrackStartScreen />);
    expect(await screen.findByRole('button', { name: /^Words/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Python/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /English words/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'vs CPU' }));
    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.type(screen.getByRole('textbox'), '100');
    expect(screen.getByText('about 1200 KPM')).toBeTruthy();
  });

  it('hints the speed of code for the code track', async () => {
    serve(ALL);
    inTrack('code', <TrackStartScreen />);
    expect(await screen.findByRole('button', { name: /^Python/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Words/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'vs CPU' }));
    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.type(screen.getByRole('textbox'), '100');
    expect(screen.getByText('about 800 KPM')).toBeTruthy();
  });

  it('shows the rating of the track, from its own pools only', async () => {
    serve(ALL, {
      '/ratings': {
        languages: [
          { language: 'python', displayName: 'Python', rating: 2000, gamesPlayed: 30 },
          { language: 'en-word', displayName: 'English words', rating: 0, gamesPlayed: 0 },
        ],
      },
    });
    const { container } = inTrack('natural-en', <TrackStartScreen />);
    await screen.findByRole('button', { name: /^Words/ });
    // Python's 2000 is code's, so the English track is still at the bottom.
    await vi.waitFor(() => {
      expect(container.querySelector('.rating-total-value')?.textContent).toBe('0');
    });
    cleanup();
    const code = inTrack('code', <TrackStartScreen />);
    await vi.waitFor(() => {
      expect(code.container.querySelector('.rating-total-value')?.textContent).toBe('1000');
    });
  });

  it('asks for the history of the track, and offers its pools as the filter', async () => {
    const urls = serve(ALL);
    inTrack('natural-en', <HistoryScreen />);
    const select = await screen.findByRole('combobox', { name: /Language/ });
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['All', 'Words', 'Sentences', 'Paragraphs']);
    await vi.waitFor(() => {
      expect(urls.some((url) => url.includes('/history') && url.includes('track=natural-en'))).toBe(
        true,
      );
    });
    expect(
      urls.filter((url) => url.includes('/history')).every((url) => url.includes('track=')),
    ).toBe(true);
  });

  it('lists only the conquests of the track', async () => {
    serve(ALL, {
      '/cpu-conquests': {
        languages: [
          { language: 'python', highestLevel: 3, beatenLevels: [1, 2, 3], totalConquests: 3 },
          { language: 'en-word', highestLevel: 5, beatenLevels: [5], totalConquests: 1 },
        ],
      },
    });
    inTrack('natural-en', <ConquestsScreen />);
    expect(await screen.findByRole('heading', { name: /^Words/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /^Python/ })).toBeNull();
  });

  it('offers only the pools of the track in the rankings and the dashboard', async () => {
    const urls = serve(ALL);
    inTrack('natural-en', <RankingsScreen />);
    const group = within(await screen.findByRole('group', { name: 'Language' }));
    expect(group.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Words',
      'Sentences',
      'Paragraphs',
    ]);
    await vi.waitFor(() => {
      expect(
        urls.some((url) => url.includes('/rankings') && url.includes('language=en-word')),
      ).toBe(true);
    });
    cleanup();
    inTrack('natural-en', <DashboardScreen />);
    await vi.waitFor(() => {
      expect(
        urls.some((url) => url.includes('/dashboard') && url.includes('language=en-word')),
      ).toBe(true);
    });
    expect(urls.filter((url) => url.includes('/dashboard') && url.includes('python'))).toEqual([]);
  });
});
