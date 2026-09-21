// @vitest-environment jsdom
import { PLAY_DURATION_MS, IDLE_LIMIT_MS } from '@typing-trainer/typing-engine';
import { cleanup, render, screen, within } from '@testing-library/react';
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
  displayName: null,
  timezone: 'UTC',
  locale: 'en',
};

const LANGUAGES = {
  languages: [
    { slug: 'python', displayName: 'Python' },
    { slug: 'go', displayName: 'Go' },
  ],
};

const RATINGS = {
  languages: [
    { language: 'python', displayName: 'Python', rating: 812, gamesPlayed: 30 },
    { language: 'go', displayName: 'Go', rating: 0, gamesPlayed: 0 },
  ],
};

const ISSUED = {
  sessionId: '22222222-2222-4222-8222-222222222222',
  language: 'python',
  mode: 'single',
  cpuLevel: null,
  ghostPeriod: null,
  ghostScore: null,
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
    expect(await screen.findByRole('button', { name: /^Python/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Go/ })).toBeTruthy();
  });

  it('shows the player’s rank and the rating of each language on its button', async () => {
    vi.stubGlobal('fetch', (url: string) =>
      Promise.resolve(json(url.endsWith('/ratings') ? RATINGS : LANGUAGES)),
    );
    renderScreen();
    // 812 in one language counts at half: 406, which is Bronze 2 (369 to 442) for the four languages there are.
    expect(await screen.findByText('Bronze 2')).toBeTruthy();
    expect(screen.getByText('406')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Python Rating 812' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go Unplayed' })).toBeTruthy();
  });

  it('shows no ratings, and still lets the player start, when they cannot be read', async () => {
    vi.stubGlobal('fetch', (url: string) =>
      Promise.resolve(url.endsWith('/ratings') ? json({}, 500) : json(LANGUAGES)),
    );
    renderScreen();
    expect(await screen.findByRole('button', { name: 'Python' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Rating' })).toBeNull();
  });

  it('starts a run for the language that was picked and goes to the play screen', async () => {
    const requests: { url: string; body?: string }[] = [];
    vi.stubGlobal('fetch', (url: string, init: { body?: string } = {}) => {
      // The ratings are read for display and are not part of what these tests are about.
      if (url.endsWith('/ratings')) return Promise.resolve(json(RATINGS));
      requests.push({ url, ...(init.body === undefined ? {} : { body: init.body }) });
      return Promise.resolve(url.endsWith('/languages') ? json(LANGUAGES) : json(ISSUED, 201));
    });

    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: /^Go/ }));

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
    await userEvent.click(await screen.findByRole('button', { name: /^Python/ }));

    expect((await screen.findByRole('alert')).textContent).toBe('too many runs');
    expect(useRunSession.getState().run).toBeNull();
    // The button is usable again, so the player can retry.
    expect(screen.getByRole('button', { name: /^Python/ })).toBeTruthy();
  });

  it('reports a language list that could not be loaded', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    renderScreen();
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be reached/);
  });
});

describe('vs CPU', () => {
  const stubServer = () => {
    const requests: { url: string; body?: string }[] = [];
    vi.stubGlobal('fetch', (url: string, init: { body?: string } = {}) => {
      // The ratings are read for display and are not part of what these tests are about.
      if (url.endsWith('/ratings')) return Promise.resolve(json(RATINGS));
      requests.push({ url, ...(init.body === undefined ? {} : { body: init.body }) });
      return Promise.resolve(
        url.endsWith('/languages')
          ? json(LANGUAGES)
          : json({ ...ISSUED, mode: 'cpu', cpuLevel: 48 }, 201),
      );
    });
    return requests;
  };

  it('starts a run against level 1 by default', async () => {
    const requests = stubServer();
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'vs CPU' }));
    expect(screen.getByLabelText(/CPU level/)).toHaveProperty('value', '1');
    await userEvent.click(screen.getByRole('button', { name: /^Go/ }));

    await screen.findByText('playing');
    expect(JSON.parse(requests[1]?.body ?? '{}')).toEqual({
      language: 'go',
      mode: 'cpu',
      cpuLevel: 1,
    });
    expect(useRunSession.getState().run?.opponent?.label).toBe('CPU Lv.48');
  });

  it('sends the level that was typed and shows its speed', async () => {
    const requests = stubServer();
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'vs CPU' }));
    const input = screen.getByLabelText(/CPU level/);
    await userEvent.clear(input);
    await userEvent.type(input, '48');
    expect(screen.getByText('about 186 KPM')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /^Python/ }));
    await screen.findByText('playing');
    expect(JSON.parse(requests[1]?.body ?? '{}')).toMatchObject({ mode: 'cpu', cpuLevel: 48 });
  });

  it.each(['', '0', '101', '1.5', 'abc', '-3'])(
    'will not start with the level "%s"',
    async (text) => {
      const requests = stubServer();
      renderScreen();
      await userEvent.click(await screen.findByRole('button', { name: 'vs CPU' }));
      const input = screen.getByLabelText(/CPU level/);
      await userEvent.clear(input);
      if (text !== '') await userEvent.type(input, text);
      const button = screen.getByRole('button', { name: /^Python/ });
      expect(button).toHaveProperty('disabled', true);
      await userEvent.click(button);
      expect(requests).toHaveLength(1);
    },
  );

  it('goes back to single play without a level', async () => {
    const requests = stubServer();
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'vs CPU' }));
    await userEvent.click(screen.getByRole('button', { name: 'Solo' }));
    await userEvent.click(screen.getByRole('button', { name: /^Go/ }));
    await screen.findByText('playing');
    expect(JSON.parse(requests[1]?.body ?? '{}')).toEqual({ language: 'go', mode: 'single' });
  });
});

describe('vs Ghost', () => {
  const RECORDS = {
    languages: [
      { language: 'python', daily: 88, weekly: 88, total: 120 },
      { language: 'go', daily: null, weekly: 61, total: 61 },
    ],
  };

  function stubServer(records: unknown = RECORDS) {
    const requests: { url: string; body?: string }[] = [];
    vi.stubGlobal('fetch', (url: string, init: { body?: string } = {}) => {
      // The ratings are read for display and are not part of what these tests are about.
      if (url.endsWith('/ratings')) return Promise.resolve(json(RATINGS));
      requests.push({ url, ...(init.body === undefined ? {} : { body: init.body }) });
      if (url.endsWith('/languages')) return Promise.resolve(json(LANGUAGES));
      if (url.endsWith('/ghost-records')) return Promise.resolve(json(records));
      return Promise.resolve(
        json({ ...ISSUED, mode: 'ghost', ghostPeriod: 'weekly', ghostScore: 61 }, 201),
      );
    });
    return requests;
  }

  it('offers the three periods to race, defaulting to today', async () => {
    stubServer();
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'vs Ghost' }));

    const periods = within(screen.getByRole('group', { name: 'Record' }));
    expect(periods.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Today',
      'This week',
      'All time',
    ]);
    expect(periods.getByRole('button', { name: 'Today' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('shows the record of each language for the period, and disables a language with none', async () => {
    stubServer();
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'vs Ghost' }));

    // Today: Python has 88, Go has nothing.
    expect(await screen.findByRole('button', { name: /Python.*best 88/ })).toHaveProperty(
      'disabled',
      false,
    );
    const go = screen.getByRole('button', { name: /Go.*No record yet/ });
    expect(go).toHaveProperty('disabled', true);

    // This week and all time give Go a record.
    await userEvent.click(screen.getByRole('button', { name: 'This week' }));
    expect(screen.getByRole('button', { name: /Go.*best 61/ })).toHaveProperty('disabled', false);
    await userEvent.click(screen.getByRole('button', { name: 'All time' }));
    expect(screen.getByRole('button', { name: /Python.*best 120/ })).toBeTruthy();
  });

  it('starts a Ghost run for the language and period chosen, and names no record itself', async () => {
    const requests = stubServer();
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'vs Ghost' }));
    await userEvent.click(screen.getByRole('button', { name: 'This week' }));
    await userEvent.click(await screen.findByRole('button', { name: /Go.*best 61/ }));

    await screen.findByText('playing');
    const started = requests.find((request) => request.url.endsWith('/play/sessions'));
    expect(JSON.parse(started?.body ?? '{}')).toEqual({
      language: 'go',
      mode: 'ghost',
      ghostPeriod: 'weekly',
    });
    expect(useRunSession.getState().run?.opponent?.label).toBe("Ghost · this week's best 61");
  });

  it('treats a record of zero like no record', async () => {
    stubServer({
      languages: [{ language: 'python', daily: 0, weekly: 0, total: 0 }],
    });
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'vs Ghost' }));
    expect(await screen.findByRole('button', { name: /Python.*No record yet/ })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('reads the records again each time Ghost is chosen', async () => {
    const requests = stubServer();
    renderScreen();
    const ghostRequests = () =>
      requests.filter((request) => request.url.endsWith('/ghost-records'));
    await userEvent.click(await screen.findByRole('button', { name: 'vs Ghost' }));
    await screen.findByRole('button', { name: /Python.*best 88/ });
    await userEvent.click(screen.getByRole('button', { name: 'Solo' }));
    await userEvent.click(screen.getByRole('button', { name: 'vs Ghost' }));
    await vi.waitFor(() => {
      expect(ghostRequests()).toHaveLength(2);
    });
  });

  it('asks for no records outside Ghost mode, and shows no record hints there', async () => {
    const requests = stubServer();
    renderScreen();
    await screen.findByRole('button', { name: /^Python/ });
    expect(requests.some((request) => request.url.endsWith('/ghost-records'))).toBe(false);
    expect(screen.queryByText(/best \d+/)).toBeNull();
  });
});
