// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/app';
import { AccountScreen } from '../src/features/auth/AccountScreen';
import { useAuthStore } from '../src/features/auth/auth-store';
import { LoginScreen } from '../src/features/auth/LoginScreen';
import { applyLocale } from '../src/i18n';
import { expectNoEnglish } from './ja-helpers';

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'ada',
  timezone: 'Asia/Tokyo',
  locale: 'en',
};

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const refusal = (status: number, error: string, message: string, headers = {}) =>
  json({ statusCode: status, error, message }, status, headers);

function renderAccount() {
  return render(
    <MemoryRouter initialEntries={['/account']}>
      <Routes>
        <Route path="/account" element={<AccountScreen />} />
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/" element={<p>home</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const passwordField = () => screen.getByLabelText('Your password');
const acknowledge = () =>
  screen.getByRole('checkbox', { name: 'I understand this cannot be undone' });
const deleteButton = () => screen.getByRole('button', { name: /Delete my account|Deleting…/ });

beforeEach(() => {
  useAuthStore.setState({
    status: 'signed-in',
    user: USER,
    startupError: null,
    accountErased: false,
  });
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await applyLocale('en');
});

describe('the account screen', () => {
  it('shows who the account is, and a warning that says what erasing takes and how long a copy stays', () => {
    renderAccount();
    expect(screen.getByText('ada')).toBeTruthy();
    expect(screen.getByText('Asia/Tokyo')).toBeTruthy();
    const warning = screen.getByText(/This erases your account and everything in it/);
    expect(warning.textContent).toContain('cannot be undone');
    expect(warning.textContent).toContain('up to 7 days');
  });

  it('will not delete until the password is given and the warning acknowledged', async () => {
    const fetched = vi.fn();
    vi.stubGlobal('fetch', fetched);
    renderAccount();
    expect(deleteButton()).toHaveProperty('disabled', true);

    await userEvent.type(passwordField(), 'correct horse battery staple');
    expect(deleteButton()).toHaveProperty('disabled', true);
    await userEvent.click(acknowledge());
    expect(deleteButton()).toHaveProperty('disabled', false);

    await userEvent.clear(passwordField());
    expect(deleteButton()).toHaveProperty('disabled', true);
    // Even a form submitted some other way than the button, with the checks not met, sends nothing.
    const form = passwordField().closest('form');
    if (form === null) throw new Error('no form');
    // The password is empty and the warning acknowledged.
    fireEvent.submit(form);
    // The password is given and the acknowledgement withdrawn.
    await userEvent.type(passwordField(), 'x');
    await userEvent.click(acknowledge());
    fireEvent.submit(form);
    expect(fetched).not.toHaveBeenCalled();
  });

  it('sends the password, and on success signs out and goes to sign-in with a notice', async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', (url: string, init: { method?: string; body?: string }) => {
      calls.push({ url, method: init.method ?? 'GET', body: JSON.parse(init.body ?? 'null') });
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    renderAccount();
    await userEvent.type(passwordField(), 'correct horse battery staple');
    await userEvent.click(acknowledge());
    await userEvent.click(deleteButton());

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(calls).toEqual([
      {
        url: '/api/auth/me',
        method: 'DELETE',
        body: { password: 'correct horse battery staple' },
      },
    ]);
    expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', user: null });
    expect(screen.getByRole('status').textContent).toBe('Your account was deleted.');
  });

  it('shows the refusal of a wrong password, stays signed in, and deletes nothing', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(refusal(403, 'Forbidden', 'incorrect password')));
    renderAccount();
    await userEvent.type(passwordField(), 'not it');
    await userEvent.click(acknowledge());
    await userEvent.click(deleteButton());

    expect((await screen.findByRole('alert')).textContent).toBe('incorrect password');
    // A 403 is not a 401: the session is untouched and the screen is still here.
    expect(useAuthStore.getState().status).toBe('signed-in');
    expect(screen.getByRole('heading', { name: 'Account' })).toBeTruthy();
    // It can be tried again.
    await waitFor(() => {
      expect(deleteButton()).toHaveProperty('disabled', false);
    });
  });

  it('says when to try again after too many wrong passwords', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        refusal(429, 'Too Many Requests', 'too many attempts; try again later', {
          'retry-after': '30',
        }),
      ),
    );
    renderAccount();
    await userEvent.type(passwordField(), 'x');
    await userEvent.click(acknowledge());
    await userEvent.click(deleteButton());
    expect((await screen.findByRole('alert')).textContent).toBe(
      'too many attempts; try again later — try again in 30 seconds.',
    );
    expect(useAuthStore.getState().status).toBe('signed-in');
  });

  it('says so when the server cannot be reached, and keeps the account', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    renderAccount();
    await userEvent.type(passwordField(), 'x');
    await userEvent.click(acknowledge());
    await userEvent.click(deleteButton());
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be reached/);
    expect(useAuthStore.getState().status).toBe('signed-in');
  });

  it('does not send twice while the request is out', async () => {
    let release: (response: Response) => void = () => undefined;
    const fetched = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetched);
    renderAccount();
    await userEvent.type(passwordField(), 'x');
    await userEvent.click(acknowledge());
    await userEvent.click(deleteButton());
    expect(deleteButton().textContent).toBe('Deleting…');
    await userEvent.click(deleteButton());
    await userEvent.type(passwordField(), '{Enter}');
    expect(fetched).toHaveBeenCalledTimes(1);
    release(new Response(null, { status: 204 }));
    await screen.findByRole('heading', { name: 'Sign in' });
  });
});

describe('the sign-in notice', () => {
  it('survives the route guard, which redirects to sign-in before the screen can', async () => {
    // The whole app, so the guard that sends an anonymous visitor to /login is really there.
    vi.stubGlobal('fetch', (url: string, init: { method?: string } = {}) => {
      if (init.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }));
      if (url.endsWith('/auth/me')) return Promise.resolve(json({ user: USER }, 200));
      if (url.endsWith('/preferences')) {
        return Promise.resolve(
          json(
            {
              timezone: 'Asia/Tokyo',
              locale: 'en',
              font: 'jetbrains-mono',
              fontSize: 18,
              theme: 'system',
              colorPreset: 'standard',
              skin: 'classic',
              soundPack: 'off',
              soundVolume: 30,
            },
            200,
          ),
        );
      }
      return Promise.resolve(json({ languages: [] }, 200));
    });
    useAuthStore.setState({ status: 'loading', user: null, startupError: null });
    render(
      <MemoryRouter initialEntries={['/account']}>
        <App />
      </MemoryRouter>,
    );
    await userEvent.type(await screen.findByLabelText('Your password'), 'correct horse');
    await userEvent.click(acknowledge());
    await userEvent.click(deleteButton());

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Your account was deleted.');
  });

  it('is not shown to someone who arrived any other way', () => {
    useAuthStore.setState({ status: 'anonymous', user: null, startupError: null });
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByText('Your account was deleted.')).toBeNull();
  });
});

describe('the account screen in Japanese', () => {
  it('reads in Japanese, and shows the refusal of a wrong password in Japanese', async () => {
    await applyLocale('ja');
    vi.stubGlobal('fetch', () => Promise.resolve(refusal(403, 'Forbidden', 'incorrect password')));
    const { container } = renderAccount();
    expect(screen.getByRole('heading', { name: 'アカウント' })).toBeTruthy();
    expect(screen.getByText(/アカウントと、その中のすべて/).textContent).toContain('7 日間');
    expectNoEnglish(container);

    await userEvent.type(screen.getByLabelText('パスワード'), 'x');
    await userEvent.click(screen.getByRole('checkbox', { name: '元に戻せないことを理解しました' }));
    await userEvent.click(screen.getByRole('button', { name: 'アカウントを削除する' }));
    expect((await screen.findByRole('alert')).textContent).toBe('パスワードが正しくありません');
  });

  it('shows the notice on sign-in in Japanese after an account is erased', async () => {
    await applyLocale('ja');
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 204 })));
    renderAccount();
    await userEvent.type(screen.getByLabelText('パスワード'), 'x');
    await userEvent.click(screen.getByRole('checkbox', { name: '元に戻せないことを理解しました' }));
    await userEvent.click(screen.getByRole('button', { name: 'アカウントを削除する' }));
    expect(await screen.findByText('アカウントを削除しました。')).toBeTruthy();
  });
});
