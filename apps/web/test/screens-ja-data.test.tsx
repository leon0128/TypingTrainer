// @vitest-environment jsdom
import { DEFAULT_APPEARANCE } from '@typing-trainer/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppearance } from '../src/features/appearance/appearance-store';
import { SettingsScreen } from '../src/features/appearance/SettingsScreen';
import { ConquestsScreen } from '../src/features/conquests/ConquestsScreen';
import { DashboardScreen } from '../src/features/dashboard/DashboardScreen';
import { HistoryScreen } from '../src/features/history/HistoryScreen';
import { RankingsScreen } from '../src/features/rankings/RankingsScreen';
import { applyLocale, i18n } from '../src/i18n';
import { expectNoEnglish } from './ja-helpers';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const LANGUAGES = {
  languages: [
    { slug: 'python', displayName: 'Python', track: 'code', kind: null },
    { slug: 'go', displayName: 'Go', track: 'code', kind: null },
  ],
};

const ROW_ID = '11111111-1111-4111-8111-111111111111';

/** One answer per API path, for the screens that read several. */
function stubApi(overrides: Record<string, unknown> = {}) {
  const answers: Record<string, unknown> = {
    '/languages': LANGUAGES,
    '/rankings': {
      period: 'daily',
      language: 'python',
      entries: [
        {
          id: ROW_ID,
          mode: 'single',
          startedAt: '2026-09-20T09:30:00.000Z',
          score: 88,
          kpm: 120,
          accuracy: 0.95,
        },
      ],
    },
    '/history': {
      entries: [
        {
          id: ROW_ID,
          startedAt: '2026-09-20T09:30:00.000Z',
          mode: 'ghost',
          language: 'python',
          kpm: 120,
          accuracy: 0.95,
          score: 88,
          result: 'win',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          startedAt: '2026-09-19T09:30:00.000Z',
          mode: 'cpu',
          language: 'go',
          kpm: 90,
          accuracy: 0.9,
          score: 70,
          result: 'lose',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 45,
    },
    '/dashboard': {
      period: 'weekly',
      language: 'python',
      from: '2026-09-13',
      to: '2026-09-19',
      points: [
        { x: '2026-09-13', score: 40 },
        { x: '2026-09-15', score: 90 },
      ],
      summary: {
        totalRuns: 3,
        totalKeystrokes: 700,
        bestScores: [{ language: 'python', score: 90 }],
        highestCpuLevelBeaten: 12,
      },
    },
    '/cpu-conquests': {
      languages: [
        { language: 'python', highestLevel: 12, beatenLevels: [1, 2, 12], totalConquests: 3 },
        { language: 'go', highestLevel: null, beatenLevels: [], totalConquests: 0 },
      ],
    },
    ...overrides,
  };
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', (url: string, init: { method?: string; body?: string } = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: JSON.parse(init.body ?? 'null') });
    const path = Object.keys(answers).find((key) => url.includes(`/api${key}`));
    return Promise.resolve(json(path === undefined ? {} : answers[path]));
  });
  return calls;
}

beforeEach(async () => {
  useAppearance.setState({
    appearance: DEFAULT_APPEARANCE,
    sound: { soundPack: 'off', soundVolume: 30 },
    locale: 'ja',
    error: null,
  });
  await applyLocale('ja');
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await applyLocale('en');
});

const renderScreen = (path: string, element: React.ReactElement) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={element} />
        <Route path="/" element={<p>home</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('the rankings screen in Japanese', () => {
  it('reads in Japanese, with the time written the Japanese way', async () => {
    stubApi();
    const { container } = renderScreen('/rankings', <RankingsScreen />);
    expect(screen.getByRole('heading', { name: 'ハイスコア' })).toBeTruthy();
    expect(await screen.findByText('88')).toBeTruthy();
    for (const header of ['スコア', '正確率', '日時']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeTruthy();
    }
    const periods = within(screen.getByRole('group', { name: '期間' }));
    expect(periods.getAllByRole('button').map((button) => button.textContent)).toEqual([
      '今日',
      '今週',
      '全期間',
    ]);
    expect(container.textContent).toMatch(/2026\/9\/20/);
    expectNoEnglish(container);
  });

  it('says so in Japanese when there is nothing', async () => {
    stubApi({ '/rankings': { period: 'daily', language: 'python', entries: [] } });
    renderScreen('/rankings', <RankingsScreen />);
    expect(await screen.findByText('この期間の記録はまだありません。')).toBeTruthy();
  });
});

describe('the history screen in Japanese', () => {
  it('reads in Japanese: filters, modes, results, and paging', async () => {
    stubApi();
    const { container } = renderScreen('/history', <HistoryScreen />);
    expect(screen.getByRole('heading', { name: 'プレイログ' })).toBeTruthy();
    await screen.findByText('88');

    const mode = screen.getByLabelText('モード');
    expect(
      within(mode)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['すべて', 'ソロプレイ', 'vs CPU', 'vs ゴースト']);
    expect(screen.getByText('vs ゴースト', { selector: 'td' })).toBeTruthy();
    expect(screen.getByText('勝ち', { selector: 'td' })).toBeTruthy();
    expect(screen.getByText('負け', { selector: 'td' })).toBeTruthy();
    expect(screen.getByText('1 / 3 ページ')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '削除' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: '前へ' })).toHaveProperty('disabled', true);
    expectNoEnglish(container);
  });

  it('asks before deleting, in Japanese', async () => {
    stubApi();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderScreen('/history', <HistoryScreen />);
    await screen.findByText('88');
    const [first] = screen.getAllByRole('button', { name: '削除' });
    if (first === undefined) throw new Error('no delete button');
    await userEvent.click(first);
    expect(confirm).toHaveBeenCalledWith('このプレイを削除しますか?元に戻せません。');
    confirm.mockRestore();
  });
});

describe('the dashboard screen in Japanese', () => {
  it('reads in Japanese: summary, periods, ranges, and the chart', async () => {
    stubApi();
    const { container } = renderScreen('/dashboard', <DashboardScreen />);
    expect(screen.getByRole('heading', { name: 'ステータス' })).toBeTruthy();
    expect(await screen.findByRole('img', { name: 'スコアの推移' })).toBeTruthy();
    expect(screen.getByText('プレイ回数: 3')).toBeTruthy();
    expect(screen.getByText('総キー入力数: 700')).toBeTruthy();
    expect(screen.getByText('撃破した CPU の最高 Level: 12')).toBeTruthy();
    expect(screen.getByText(/ハイスコア:.*Python 90/)).toBeTruthy();
    expect(
      within(screen.getByRole('group', { name: '期間' }))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['日別', '週別', '全期間']);
    expect(screen.getByRole('button', { name: '← 前へ' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '全期間' }));
    expect(
      within(screen.getByRole('group', { name: '範囲' }))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['30 日', '90 日', '365 日', 'すべて']);
    expectNoEnglish(container);
  });
});

describe('the conquests screen in Japanese', () => {
  it('is the CPU対戦 screen, and reads in Japanese', async () => {
    stubApi();
    const { container } = renderScreen('/conquests', <ConquestsScreen />);
    expect(screen.getByRole('heading', { name: 'CPU対戦' })).toBeTruthy();
    expect(
      await screen.findByText(/撃破した最高 Level: 12 · 撃破 Level 数: 3 \/ 100/),
    ).toBeTruthy();
    const python = within(screen.getByLabelText('Pythonの Level'));
    expect(python.getByLabelText('Level 12 撃破済み').textContent).toContain('✓');
    expect(python.getByLabelText('Level 3 未撃破').textContent).not.toContain('✓');
    expect(screen.getByText(/vs CPU でその Level に勝つと記録されます/)).toBeTruthy();
    expectNoEnglish(container);
  });
});

describe('the appearance screen in Japanese', () => {
  it('reads in Japanese: every group, choice, and note', () => {
    stubApi();
    const { container } = renderScreen('/settings', <SettingsScreen />);
    expect(screen.getByRole('heading', { name: '設定' })).toBeTruthy();
    for (const legend of ['言語', 'フォント', 'サイズ', 'テーマ', '配色', 'サウンド']) {
      expect(screen.getByText(legend, { selector: 'legend' })).toBeTruthy();
    }
    const names = (group: string) =>
      within(screen.getByRole('group', { name: group }))
        .getAllByRole('button')
        .map((button) => button.textContent);
    expect(names('サウンドの種類')).toEqual(['オフ', 'メカニカル', 'ソフト', 'ビープ']);
    expect(screen.getByRole('button', { name: 'システム' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ハイコントラスト' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /標準/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /モノクロ/ })).toBeTruthy();
    expect(screen.getByText('サウンドを選ぶと聞けます。')).toBeTruthy();
    expect(screen.getByLabelText('プレビュー', { selector: 'section' })).toBeTruthy();
    expectNoEnglish(container);
  });

  it('switches the language at once, saves it, and can switch back', async () => {
    const calls = stubApi({
      '/preferences': {
        timezone: 'UTC',
        ...DEFAULT_APPEARANCE,
        soundPack: 'off',
        soundVolume: 30,
        locale: 'en',
      },
    });
    renderScreen('/settings', <SettingsScreen />);
    const fieldset = screen.getByText('言語', { selector: 'legend' }).closest('fieldset');
    if (fieldset === null) throw new Error('no language group');
    const group = within(fieldset);
    expect(group.getByRole('button', { name: '日本語' }).getAttribute('aria-pressed')).toBe('true');

    await userEvent.click(group.getByRole('button', { name: 'English' }));
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(i18n.language).toBe('en');
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ locale: 'en' });
    expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});
