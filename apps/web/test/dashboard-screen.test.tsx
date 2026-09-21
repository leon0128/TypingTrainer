// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardScreen } from '../src/features/dashboard/DashboardScreen';
import { niceMax, plot } from '../src/features/dashboard/chart';

const SUMMARY = {
  totalRuns: 3,
  totalKeystrokes: 700,
  bestScores: [{ language: 'python', score: 90 }],
  highestCpuLevelBeaten: null,
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const RATINGS = {
  languages: [{ language: 'python', displayName: 'Python', rating: 700, gamesPlayed: 12 }],
};

let requested: URL[] = [];

beforeEach(() => {
  requested = [];
  vi.stubGlobal('fetch', (url: string) => {
    if (url.endsWith('/languages')) {
      return Promise.resolve(json({ languages: [{ slug: 'python', displayName: 'Python' }] }));
    }
    if (url.endsWith('/ratings')) return Promise.resolve(json(RATINGS));
    const parsed = new URL(url, 'http://localhost');
    requested.push(parsed);
    const period = parsed.searchParams.get('period');
    const from = parsed.searchParams.get('from') ?? '2026-09-13';
    return Promise.resolve(
      json({
        period,
        language: 'python',
        from,
        to: period === 'total' ? null : from,
        points:
          period === 'total'
            ? []
            : [
                { x: '2026-09-13', score: 40 },
                { x: '2026-09-14', score: null },
                { x: '2026-09-15', score: 90 },
              ],
        summary: SUMMARY,
      }),
    );
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<DashboardScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('dashboard screen', () => {
  it('shows the summary and a chart for the default weekly view', async () => {
    renderScreen();
    expect(await screen.findByRole('img', { name: 'Score trend' })).toBeTruthy();
    expect(screen.getByText('Python 90', { exact: false })).toBeTruthy();
    expect(screen.getByText('Total keystrokes: 700')).toBeTruthy();
  });

  it('shows the rank, the overall rating, and the rating of each language', async () => {
    renderScreen();
    // 700 in the one language counts at half: 350, which is Bronze 1 (295 to 368) for the four languages there are.
    expect(await screen.findByText('Bronze 1')).toBeTruthy();
    expect(screen.getByText('350')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Rating by language' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Python rating' })).toBeTruthy();
  });

  it('moves the weekly view back by seven days', async () => {
    renderScreen();
    await screen.findByRole('img', { name: 'Score trend' });
    await userEvent.click(screen.getByRole('button', { name: '← Previous' }));
    await screen.findByText('2026-09-06');
    expect(requested.at(-1)?.searchParams.get('from')).toBe('2026-09-06');
  });

  it('asks for a bounded range on all-time and an open one on All', async () => {
    renderScreen();
    await screen.findByRole('img', { name: 'Score trend' });
    await userEvent.click(screen.getByRole('button', { name: 'All time' }));
    expect(await screen.findByText('No scores for this period.')).toBeTruthy();
    expect(requested.at(-1)?.searchParams.get('from')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    await screen.findByText('No scores for this period.');
    expect(requested.at(-1)?.searchParams.get('from')).toBeNull();
  });
});

describe('chart layout', () => {
  it('rounds the axis maximum up to a readable value', () => {
    expect(niceMax(87)).toBe(90);
    expect(niceMax(0)).toBe(10);
    expect(niceMax(240)).toBe(250);
  });

  it('spaces points evenly and breaks the line at an unplayed day', () => {
    const laid = plot([
      { x: 'a', score: 10 },
      { x: 'b', score: null },
      { x: 'c', score: 20 },
    ]);
    expect(laid.points).toHaveLength(2);
    expect(laid.segments).toHaveLength(2);
    expect(laid.points[0]?.y).toBeGreaterThan(laid.points[1]?.y ?? 0);
  });
});
