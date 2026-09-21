// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConquestsScreen } from '../src/features/conquests/ConquestsScreen';

const LANGUAGES = {
  languages: [
    { slug: 'python', displayName: 'Python' },
    { slug: 'go', displayName: 'Go' },
  ],
};

const CONQUESTS = {
  languages: [
    { language: 'python', highestLevel: 12, beatenLevels: [1, 2, 12], totalConquests: 3 },
    { language: 'go', highestLevel: null, beatenLevels: [], totalConquests: 0 },
  ],
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/conquests']}>
      <Routes>
        <Route path="/conquests" element={<ConquestsScreen />} />
        <Route path="/" element={<p>choose a language</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('conquests screen', () => {
  it('shows the highest level, the count, and a grid of all 100 levels per language', async () => {
    vi.stubGlobal('fetch', (url: string) =>
      Promise.resolve(json(url.endsWith('/languages') ? LANGUAGES : CONQUESTS)),
    );
    renderScreen();

    expect(await screen.findByText(/Toughest CPU beaten: Lv.12 · Beaten: 3 \/ 100/)).toBeTruthy();
    expect(screen.getByText(/Toughest CPU beaten: Lv.— · Beaten: 0 \/ 100/)).toBeTruthy();

    const python = within(screen.getByLabelText('Python levels'));
    expect(python.getAllByRole('listitem')).toHaveLength(100);
    for (const level of [1, 2, 12]) {
      expect(python.getByLabelText(`Level ${String(level)} beaten`).textContent).toContain('✓');
    }
    expect(python.getByLabelText('Level 3 not beaten').textContent).not.toContain('✓');
    expect(python.getAllByLabelText(/^Level \d+ beaten$/).length).toBe(3);
  });

  it('reports a failure to load', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    renderScreen();
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be reached/);
  });
});
