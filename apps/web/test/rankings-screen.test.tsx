// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RankingsScreen } from '../src/features/rankings/RankingsScreen';

const LANGUAGES = {
  languages: [
    { slug: 'python', displayName: 'Python' },
    { slug: 'go', displayName: 'Go' },
  ],
};

const RANKINGS_BY_PERIOD: Record<string, unknown> = {
  daily: {
    period: 'daily',
    language: 'python',
    entries: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        mode: 'single',
        startedAt: '2026-09-20T09:00:00.000Z',
        score: 88,
        kpm: 120,
        accuracy: 0.95,
      },
    ],
  },
  weekly: { period: 'weekly', language: 'python', entries: [] },
  total: { period: 'total', language: 'python', entries: [] },
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/rankings']}>
      <Routes>
        <Route path="/rankings" element={<RankingsScreen />} />
        <Route path="/" element={<p>choose a language</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', (url: string) => {
    if (url.endsWith('/languages')) return Promise.resolve(json(LANGUAGES));
    const period = new URL(url, 'http://localhost').searchParams.get('period') ?? 'daily';
    return Promise.resolve(json(RANKINGS_BY_PERIOD[period]));
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('rankings screen', () => {
  it("shows the player's own top runs for the default period", async () => {
    renderScreen();
    expect(await screen.findByText('88')).toBeTruthy();
  });

  it('reloads when the period changes', async () => {
    renderScreen();
    await screen.findByText('88');
    await userEvent.click(screen.getByRole('button', { name: 'This week' }));
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'No scores for this period yet.',
    );
  });
});
