// @vitest-environment jsdom
import type { Language } from '@typing-trainer/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../src/features/auth/auth-store';
import { HomeScreen } from '../src/features/home/HomeScreen';
import { useLanguageStore } from '../src/features/tracks/language-store';
import { applyLocale } from '../src/i18n';
import { expectNoEnglish } from './ja-helpers';

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'ada',
  displayName: null,
  timezone: 'UTC',
  locale: 'en' as const,
};

const lang = (
  slug: string,
  displayName: string,
  track: Language['track'],
  kind: Language['kind'],
) => ({ slug, displayName, track, kind }) as Language;
const PYTHON = lang('python', 'Python', 'code', null);
const EN_WORD = lang('en-word', 'English words', 'natural-en', 'word');
const JA_WORD = lang('ja-word', 'Japanese words', 'natural-ja', 'word');

const RATINGS = {
  languages: [
    { language: 'python', displayName: 'Python', rating: 2000, gamesPlayed: 30 },
    { language: 'en-word', displayName: 'English words', rating: 0, gamesPlayed: 0 },
    { language: 'ja-word', displayName: 'Japanese words', rating: 2000, gamesPlayed: 12 },
  ],
};

const ACTIVITY = {
  from: '2026-03-11',
  to: '2027-03-10',
  days: [
    { date: '2026-04-02', code: 2, natural: 0 },
    { date: '2026-09-20', code: 1, natural: 3 },
    { date: '2026-09-23', code: 0, natural: 1 },
  ],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The item at an index, failing the test if there is none. */
function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${String(index)}`);
  return item;
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/code" element={<p>code start</p>} />
        <Route path="/en" element={<p>english start</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function serve(activity: unknown = ACTIVITY, activityStatus = 200) {
  vi.stubGlobal('fetch', (url: string) => {
    if (url.endsWith('/ratings')) return Promise.resolve(json(RATINGS));
    if (url.endsWith('/activity')) return Promise.resolve(json(activity, activityStatus));
    return Promise.resolve(json({}, 404));
  });
}

beforeEach(() => {
  useAuthStore.setState({ status: 'signed-in', user: USER, startupError: null });
  useLanguageStore.setState({ languages: [PYTHON, EN_WORD], error: null });
});

afterEach(async () => {
  cleanup();
  useLanguageStore.getState().reset();
  vi.unstubAllGlobals();
  await applyLocale('en');
});

describe('the home screen', () => {
  it('shows a card for each track the account may use, with where the player stands in it', async () => {
    serve();
    renderHome();
    const cards = await screen.findAllByRole('link');
    expect(cards.map((card) => card.getAttribute('href'))).toEqual(['/code', '/en']);
    const code = within(nth(cards, 0));
    expect(code.getByText('Code')).toBeTruthy();
    // Python at 2000 is the whole of one language of four: 1000 overall.
    expect(code.getByText('1000')).toBeTruthy();
    const english = within(nth(cards, 1));
    expect(english.getByText('English')).toBeTruthy();
    expect(english.getByText('0')).toBeTruthy();
    expect(english.getByText('Beginner 1')).toBeTruthy();
    // Python's rating is code's own: it does not lift the English track.
    expect(english.queryByText('1000')).toBeNull();
  });

  it('rates the Japanese track only from its own pool, and only when the account may use it', async () => {
    serve();
    renderHome();
    await screen.findAllByRole('link');
    expect(screen.queryByText('日本語')).toBeNull();
    expect(screen.queryByText('Japanese')).toBeNull();
    cleanup();
    useLanguageStore.setState({ languages: [PYTHON, EN_WORD, JA_WORD], error: null });
    renderHome();
    const cards = await screen.findAllByRole('link');
    expect(cards.map((card) => card.getAttribute('href'))).toEqual(['/code', '/ja', '/en']);
    expect(within(nth(cards, 1)).getByText('Japanese')).toBeTruthy();
  });

  it('goes to the track of the card', async () => {
    serve();
    renderHome();
    await userEvent.click(nth(await screen.findAllByRole('link'), 1));
    expect(await screen.findByText('english start')).toBeTruthy();
  });

  it('says the totals of the year, and lists the days with runs', async () => {
    serve();
    renderHome();
    expect(await screen.findByText('Runs: 7 · Days played: 3')).toBeTruthy();
    const list = within(screen.getByText('Show as a list').closest('details') as HTMLElement);
    const rows = list.getAllByRole('row').slice(1);
    expect(
      rows.map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      ),
    ).toEqual([
      ['2', '0'],
      ['1', '3'],
      ['0', '1'],
    ]);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual([
      '2026-04-02',
      '2026-09-20',
      '2026-09-23',
    ]);
  });

  it('draws a cell for each day of the year, coloured for the kinds of run it had', async () => {
    serve();
    const { container } = renderHome();
    await screen.findByText('Runs: 7 · Days played: 3');
    const cells = [...container.querySelectorAll('.activity-grid .activity-cell')];
    expect(cells.filter((cell) => !cell.classList.contains('is-blank'))).toHaveLength(365);
    const titled = (date: string) => container.querySelector(`[title^="${date} "]`);
    expect(titled('2026-04-02')?.className).toBe('activity-cell has-code');
    expect(titled('2026-04-02')?.getAttribute('data-code')).toBe('2');
    expect(titled('2026-09-23')?.className).toBe('activity-cell has-natural');
    const both = titled('2026-09-20');
    expect(both?.className).toBe('activity-cell has-code has-natural');
    expect([both?.getAttribute('data-code'), both?.getAttribute('data-natural')]).toEqual([
      '1',
      '2',
    ]);
    expect(both?.getAttribute('title')).toBe('2026-09-20 — code: 1, natural language: 3');
    expect(titled('2026-05-15')?.className).toBe('activity-cell');
  });

  it('does not tell a day by colour alone: the picture is hidden from a screen reader, and the words are not', async () => {
    serve();
    const { container } = renderHome();
    await screen.findByText('Runs: 7 · Days played: 3');
    expect(container.querySelector('.activity-grid')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.activity-legend')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Last year' })).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('labels the months and three weekdays', async () => {
    serve();
    const { container } = renderHome();
    await screen.findByText('Runs: 7 · Days played: 3');
    const months = [...container.querySelectorAll('.activity-months span')]
      .map((span) => span.textContent)
      .filter((text) => text !== '');
    expect(months).toEqual([
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
      'Jan',
      'Feb',
      'Mar',
    ]);
    expect(
      [...container.querySelectorAll('.activity-weekdays span')].map((span) => span.textContent),
    ).toEqual(['Mon', 'Wed', 'Fri']);
  });

  it('says when the year cannot be read, and still shows the tracks', async () => {
    serve({ statusCode: 500, error: 'Internal Server Error', message: 'x' }, 500);
    renderHome();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('reads in Japanese, in the words of the requester', async () => {
    serve();
    await applyLocale('ja');
    useLanguageStore.setState({ languages: [PYTHON, EN_WORD, JA_WORD], error: null });
    const { container } = renderHome();
    expect(await screen.findByText('プレイ回数: 7 · プレイした日: 3')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'この1年' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'トラック' })).toBeTruthy();
    const names = screen
      .getAllByRole('link')
      .map((card) => within(card).getAllByText(/./)[0]?.textContent);
    expect(names).toEqual(['コード', '日本語', '英語']);
    expectNoEnglish(container);
  });
});
