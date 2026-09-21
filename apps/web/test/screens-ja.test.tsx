// @vitest-environment jsdom
import { DEFAULT_APPEARANCE, type GhostRecordsResponse } from '@typing-trainer/contracts';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppearance } from '../src/features/appearance/appearance-store';
import { useAuthStore } from '../src/features/auth/auth-store';
import { LoginScreen } from '../src/features/auth/LoginScreen';
import { RegisterScreen } from '../src/features/auth/RegisterScreen';
import { StartupScreen } from '../src/features/auth/StartupScreen';
import { LanguageScreen } from '../src/features/languages/LanguageScreen';
import { PlayScreen } from '../src/features/play/PlayScreen';
import { useRunSession } from '../src/features/play/run-session';
import { applyLocale, i18n } from '../src/i18n';
import { expectNoEnglish } from './ja-helpers';
import { IF_PROGRAM, PADDED_PROGRAM } from './program-fixture';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'ada',
  timezone: 'UTC',
  locale: 'en',
};

beforeEach(async () => {
  useAuthStore.setState({ status: 'anonymous', user: null, startupError: null });
  useAppearance.setState({
    appearance: DEFAULT_APPEARANCE,
    sound: { soundPack: 'off', soundVolume: 30 },
    locale: 'ja',
    error: null,
  });
  useRunSession.setState({ run: null, submission: { kind: 'unsent' } });
  await applyLocale('ja');
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await applyLocale('en');
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/register" element={<RegisterScreen />} />
        <Route path="/play" element={<PlayScreen />} />
        <Route path="/" element={<LanguageScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('the sign-in and registration screens in Japanese', () => {
  it('sign-in reads in Japanese, and asks for both fields in Japanese', async () => {
    const { container } = renderAt('/login');
    expect(screen.getByRole('heading', { name: 'ログイン' })).toBeTruthy();
    expect(screen.getByLabelText('ユーザー名')).toBeTruthy();
    expect(screen.getByLabelText('パスワード')).toBeTruthy();
    expectNoEnglish(container);

    await userEvent.click(screen.getByRole('button', { name: 'ログイン' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'ユーザー名とパスワードを入力してください。',
    );
  });

  it('registration reads in Japanese, with the rule for passwords', () => {
    const { container } = renderAt('/register');
    expect(screen.getByRole('heading', { name: 'プレイヤー登録' })).toBeTruthy();
    expect(screen.getByText('8文字以上。覚えやすいフレーズでも構いません。')).toBeTruthy();
    expectNoEnglish(container);
  });

  it('shows the registration rules the contract checks in Japanese', async () => {
    renderAt('/register');
    await userEvent.type(screen.getByLabelText('ユーザー名'), 'ada');
    await userEvent.type(screen.getByLabelText('パスワード'), 'short');
    await userEvent.click(screen.getByRole('button', { name: '登録してスタート' }));
    expect((await screen.findByRole('alert')).textContent).toBe('8文字以上にしてください');
  });

  it('shows what the server refused, in Japanese', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        json({ statusCode: 409, error: 'Conflict', message: 'username is taken' }, 409),
      ),
    );
    renderAt('/register');
    await userEvent.type(screen.getByLabelText('ユーザー名'), 'ada');
    await userEvent.type(screen.getByLabelText('パスワード'), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: '登録してスタート' }));
    expect((await screen.findByRole('alert')).textContent).toBe('そのユーザー名は使われています');
  });

  it('the startup screen reads in Japanese', () => {
    const { container } = render(
      <MemoryRouter>
        <StartupScreen />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status').textContent).toBe('ロード中…');
    expectNoEnglish(container);
  });
});

describe('the language switch before an account', () => {
  it('offers each language in its own name, marked as that language', async () => {
    await applyLocale('en');
    useAppearance.setState({ locale: 'en' });
    renderAt('/login');
    const group = within(screen.getByRole('group', { name: 'Language' }));
    const english = group.getByRole('button', { name: 'English' });
    const japanese = group.getByRole('button', { name: '日本語' });
    expect(english.getAttribute('lang')).toBe('en');
    expect(japanese.getAttribute('lang')).toBe('ja');
    expect(english.getAttribute('aria-pressed')).toBe('true');
  });

  it('changes the screen at once, for this visit only, and sends nothing', async () => {
    await applyLocale('en');
    useAppearance.setState({ locale: 'en' });
    const fetched = vi.fn();
    vi.stubGlobal('fetch', fetched);
    renderAt('/login');
    await userEvent.click(screen.getByRole('button', { name: '日本語' }));

    expect(await screen.findByRole('heading', { name: 'ログイン' })).toBeTruthy();
    expect(document.documentElement.lang).toBe('ja');
    expect(screen.getByRole('button', { name: '日本語' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(fetched).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
  });
});

describe('registering in the language the screen is in', () => {
  const REGISTERED = { user: USER };

  function stubRegistration() {
    const calls: { url: string; method: string; body: unknown; signedInYet: boolean }[] = [];
    vi.stubGlobal('fetch', (url: string, init: { method?: string; body?: string }) => {
      calls.push({
        url,
        method: init.method ?? 'GET',
        body: JSON.parse(init.body ?? 'null'),
        // Whether the app already knows it is signed in when this request goes out.
        signedInYet: useAuthStore.getState().status === 'signed-in',
      });
      if (url.endsWith('/auth/register')) return Promise.resolve(json(REGISTERED, 201));
      if (url.endsWith('/preferences')) {
        return Promise.resolve(
          json({
            timezone: 'UTC',
            ...DEFAULT_APPEARANCE,
            soundPack: 'off',
            soundVolume: 30,
            locale: 'ja',
          }),
        );
      }
      return Promise.resolve(json({ languages: [] }));
    });
    return calls;
  }

  async function register() {
    await userEvent.type(screen.getByLabelText(/ユーザー名|Username/), 'ada');
    await userEvent.type(screen.getByLabelText(/パスワード|Password/), 'correct horse battery');
    await userEvent.click(
      screen.getByRole('button', { name: /登録してスタート|Register and start/ }),
    );
  }

  it('saves Japanese for the new account, before the app learns it is signed in', async () => {
    const calls = stubRegistration();
    renderAt('/register');
    await register();

    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('signed-in');
    });
    const requests = calls.map((call) => `${call.method} ${call.url}`);
    expect(requests.indexOf('POST /api/auth/register')).toBeGreaterThanOrEqual(0);
    const put = calls.find((call) => call.method === 'PUT');
    expect(put?.body).toEqual({ locale: 'ja' });
    // The language goes out while the app still thinks nobody is signed in: once it knows, it loads
    // the account's settings, and they would still say English.
    expect(put?.signedInYet).toBe(false);
    // Saved after the account exists and before signing in, so loading the settings sees Japanese.
    expect(requests.indexOf('PUT /api/preferences')).toBeGreaterThan(
      requests.indexOf('POST /api/auth/register'),
    );
    expect(useAuthStore.getState().user?.locale).toBe('ja');
    expect(i18n.language).toBe('ja');
  });

  it('saves nothing for English, which is what a new account already has', async () => {
    await applyLocale('en');
    useAppearance.setState({ locale: 'en' });
    const calls = stubRegistration();
    renderAt('/register');
    await register();
    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('signed-in');
    });
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });

  it('still signs in when saving the language fails', async () => {
    vi.stubGlobal('fetch', (url: string) =>
      Promise.resolve(
        url.endsWith('/auth/register')
          ? json(REGISTERED, 201)
          : json({ statusCode: 500, error: 'Internal Server Error', message: 'x' }, 500),
      ),
    );
    renderAt('/register');
    await register();
    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('signed-in');
    });
  });
});

describe('the language screen in Japanese', () => {
  const LANGUAGES = {
    languages: [
      { slug: 'python', displayName: 'Python' },
      { slug: 'go', displayName: 'Go' },
    ],
  };
  const RECORDS: GhostRecordsResponse = {
    languages: [
      { language: 'python', daily: 88, weekly: 88, total: 120 },
      { language: 'go', daily: null, weekly: null, total: null },
    ],
  };

  beforeEach(() => {
    useAuthStore.setState({ status: 'signed-in', user: USER, startupError: null });
    vi.stubGlobal('fetch', (url: string) =>
      Promise.resolve(json(url.endsWith('/languages') ? LANGUAGES : RECORDS)),
    );
  });

  it('reads in Japanese with the terms the requester chose', async () => {
    const { container } = renderAt('/');
    await screen.findByRole('button', { name: 'Python' });
    for (const name of ['ハイスコア', '設定', '対戦記録', 'ステータス', 'プレイログ']) {
      expect(screen.getByRole('link', { name })).toBeTruthy();
    }
    const modes = within(screen.getByRole('group', { name: 'モード' }));
    expect(modes.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'ソロプレイ',
      'vs CPU',
      'vs ゴースト',
    ]);
    expect(screen.getByRole('heading', { name: 'ステージを選ぶ' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ログアウト' })).toBeTruthy();
    expectNoEnglish(container);
  });

  it('shows the CPU level with its speed, and complains about a bad level, in Japanese', async () => {
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'vs CPU' }));
    expect(screen.getByText('CPU の強さ(1–100)')).toBeTruthy();
    expect(screen.getByText('約 50 KPM')).toBeTruthy();
    await userEvent.clear(screen.getByLabelText(/強さ/));
    expect(screen.getByText('1〜100 の整数を入力してください')).toBeTruthy();
  });

  it('shows the Ghost options, periods, and records in Japanese', async () => {
    const { container } = renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'vs ゴースト' }));
    const periods = within(screen.getByRole('group', { name: '記録' }));
    expect(periods.getAllByRole('button').map((button) => button.textContent)).toEqual([
      '今日',
      '今週',
      '全期間',
    ]);
    expect(await screen.findByRole('button', { name: /Python.*ベスト 88/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Go.*記録なし/ })).toHaveProperty('disabled', true);
    expectNoEnglish(container);
  });
});

describe('the play screen in Japanese', () => {
  const ISSUED = {
    sessionId: '22222222-2222-4222-8222-222222222222',
    language: 'python' as const,
    mode: 'single' as const,
    cpuLevel: null,
    ghostPeriod: null,
    ghostScore: null,
    seed: '7',
    contentRevision: 'b'.repeat(64),
    blocks: [IF_PROGRAM, PADDED_PROGRAM],
    durationMs: 120_000,
    idleLimitMs: 900_000,
  };

  it('reads the header, the status, and the overlay in Japanese', () => {
    useRunSession.getState().begin(ISSUED, performance.now());
    const { container } = renderAt('/play');
    expect(screen.getByText(/ステージ 1 \/ 2/)).toBeTruthy();
    expect(screen.getByText(/KPM 0 · 正確率 0% · SCORE 0/)).toBeTruthy();
    expect(screen.getByText(/TIME/)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('最初のキーでカウントダウン開始!');
    expect(screen.getByLabelText('入力欄')).toBeTruthy();
    expect(screen.getAllByLabelText('入力するコード')).toHaveLength(2);
    expectNoEnglish(container);
  });

  it('names a Ghost and a CPU opponent in Japanese', () => {
    useRunSession
      .getState()
      .begin({ ...ISSUED, mode: 'ghost', ghostPeriod: 'daily', ghostScore: 88 }, performance.now());
    renderAt('/play');
    expect(screen.getByText(/vs 自分 · 今日のベスト 88/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'PLAYER' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /自分 · 今日のベスト 88 · SCORE 0/ })).toBeTruthy();
    expect(screen.getByLabelText('RIVAL')).toBeTruthy();
  });

  it('shows the result, the match, and the date in Japanese', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        json(
          {
            run: {
              id: '33333333-3333-4333-8333-333333333333',
              language: 'python',
              mode: 'cpu',
              cpuLevel: 50,
              ghostPeriod: null,
              startedAt: '2026-09-20T01:00:00.000Z',
              localDate: '2026-09-20',
              effectiveKeystrokes: 123,
              missCount: 4,
              rawKeystrokes: 111,
              kpm: 61.5,
              accuracy: 0.9688,
              score: 88,
              opponentScore: 70,
              result: 'win',
            },
          },
          201,
        ),
      ),
    );
    useRunSession.getState().begin({ ...ISSUED, mode: 'cpu', cpuLevel: 50 }, performance.now());
    const { container } = renderAt('/play');
    await userEvent.type(screen.getByLabelText('入力欄'), 'if(a){{{Enter}b{Enter}}');
    await userEvent.type(screen.getByLabelText('入力欄'), 'a: 1');

    expect(await screen.findByRole('heading', { name: 'WIN!' })).toBeTruthy();
    expect(screen.getByText('2026年9月20日のプレイとして保存しました。')).toBeTruthy();
    expect(container.querySelector('.match-result')?.textContent).toBe(
      'CPU Lv.50のスコアは 70、あなたは 88 でした。 同点は勝ちです。',
    );
    for (const label of ['SCORE', '正確率', 'キー入力']) {
      expect(screen.getByText(label, { selector: 'dt' })).toBeTruthy();
    }
    expect(screen.getByText('有効 123 · ミス 4 · 総数 111')).toBeTruthy();
    expect(screen.getByText('ミス率 3.1 %')).toBeTruthy();
    expectNoEnglish(container);
  });
});
