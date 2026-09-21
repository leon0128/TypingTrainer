// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HistoryScreen } from '../src/features/history/HistoryScreen';

const LANGUAGES = {
  languages: [
    { slug: 'python', displayName: 'Python' },
    { slug: 'go', displayName: 'Go' },
  ],
};

const ONE_ROW = {
  entries: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      startedAt: '2026-09-20T09:00:00.000Z',
      mode: 'single',
      language: 'python',
      kpm: 120,
      accuracy: 0.95,
      score: 88,
      result: null,
    },
  ],
  page: 1,
  pageSize: 20,
  total: 1,
};

const EMPTY = { entries: [], page: 1, pageSize: 20, total: 0 };

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/history']}>
      <Routes>
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="/" element={<p>choose a language</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('history screen', () => {
  it('shows the rows the API returns', async () => {
    vi.stubGlobal('fetch', (url: string) =>
      Promise.resolve(url.endsWith('/languages') ? json(LANGUAGES) : json(ONE_ROW)),
    );
    renderScreen();
    expect(await screen.findByText('88')).toBeTruthy();
  });

  it('filters by mode, and offers Ghost beside single play and vs CPU', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url);
      return Promise.resolve(url.endsWith('/languages') ? json(LANGUAGES) : json(ONE_ROW));
    });
    renderScreen();
    await screen.findByText('88');
    const mode = screen.getByLabelText('Mode');
    expect(
      within(mode)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['All', 'Solo', 'vs CPU', 'vs Ghost']);

    await userEvent.selectOptions(mode, 'ghost');
    await vi.waitFor(() => {
      expect(urls.some((url) => url.includes('/history') && url.includes('mode=ghost'))).toBe(true);
    });
  });

  it('shows an empty state when there are no matching runs', async () => {
    vi.stubGlobal('fetch', (url: string) =>
      Promise.resolve(url.endsWith('/languages') ? json(LANGUAGES) : json(EMPTY)),
    );
    renderScreen();
    expect(await screen.findByText('No play log matches these filters.')).toBeTruthy();
  });

  it('asks for confirmation before deleting, and removes the row once confirmed', async () => {
    const requests: string[] = [];
    vi.stubGlobal('fetch', (url: string, init: { method?: string } = {}) => {
      requests.push(`${init.method ?? 'GET'} ${url}`);
      if (url.endsWith('/languages')) return Promise.resolve(json(LANGUAGES));
      if (init.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(json(ONE_ROW));
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderScreen();
    await screen.findByText('88');
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(requests.some((r) => r.startsWith('DELETE'))).toBe(true);
    expect(screen.queryByText('88')).toBeNull();
  });

  it('deletes nothing when the confirmation is declined', async () => {
    const fetchSpy = vi.fn((url: string) =>
      Promise.resolve(url.endsWith('/languages') ? json(LANGUAGES) : json(ONE_ROW)),
    );
    vi.stubGlobal('fetch', fetchSpy);
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderScreen();
    await screen.findByText('88');
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('/history/'),
      expect.anything(),
    );
    expect(screen.getByText('88')).toBeTruthy();
  });

  it('links back to language selection', async () => {
    vi.stubGlobal('fetch', (url: string) =>
      Promise.resolve(url.endsWith('/languages') ? json(LANGUAGES) : json(EMPTY)),
    );
    renderScreen();
    await screen.findByText('No play log matches these filters.');
    await userEvent.click(screen.getByRole('link', { name: 'Home' }));
    expect(await screen.findByText('choose a language')).toBeTruthy();
  });
});
