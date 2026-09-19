// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';

import { useAuthStore } from '../src/features/auth/auth-store';
import { LoginScreen } from '../src/features/auth/LoginScreen';
import { RegisterScreen } from '../src/features/auth/RegisterScreen';

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'ada',
  timezone: 'UTC',
  locale: 'en',
};
const PASSWORD = 'correct horse battery staple';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Renders a screen at its own path, with a stand-in for the app the screen navigates to. */
function renderScreen(path: '/login' | '/register') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/register" element={<RegisterScreen />} />
        <Route path="/" element={<p>signed in</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuthStore.setState({ status: 'anonymous', user: null, startupError: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('sign-in screen', () => {
  it('signs in and moves on to the app', async () => {
    const bodies: string[] = [];
    vi.stubGlobal('fetch', (_url: string, init: { body?: string }) => {
      bodies.push(init.body ?? '');
      return Promise.resolve(json({ user: USER }));
    });

    renderScreen('/login');
    await userEvent.type(screen.getByLabelText('Username'), 'ada');
    await userEvent.type(screen.getByLabelText('Password'), PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await screen.findByText('signed in');
    expect(JSON.parse(bodies[0] ?? '{}')).toEqual({ username: 'ada', password: PASSWORD });
    expect(useAuthStore.getState()).toMatchObject({ status: 'signed-in', user: USER });
  });

  it('shows the message the API returned and stays on the screen', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        json(
          { statusCode: 401, error: 'Unauthorized', message: 'username or password is wrong' },
          401,
        ),
      ),
    );

    renderScreen('/login');
    await userEvent.type(screen.getByLabelText('Username'), 'ada');
    await userEvent.type(screen.getByLabelText('Password'), PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect((await screen.findByRole('alert')).textContent).toBe('username or password is wrong');
    expect(useAuthStore.getState().status).toBe('anonymous');
  });

  it('says how long to wait when the API rate-limits the attempt', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            statusCode: 429,
            error: 'Too Many Requests',
            message: 'too many attempts',
          }),
          {
            status: 429,
            headers: { 'content-type': 'application/json', 'retry-after': '60' },
          },
        ),
      ),
    );

    renderScreen('/login');
    await userEvent.type(screen.getByLabelText('Username'), 'ada');
    await userEvent.type(screen.getByLabelText('Password'), PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect((await screen.findByRole('alert')).textContent).toContain('try again in 60 seconds');
  });
});

describe('registration screen', () => {
  it('sends the browser time zone with the account', async () => {
    const bodies: string[] = [];
    vi.stubGlobal('fetch', (_url: string, init: { body?: string }) => {
      bodies.push(init.body ?? '');
      return Promise.resolve(json({ user: USER }, 201));
    });

    renderScreen('/register');
    await userEvent.type(screen.getByLabelText('Username'), 'ada');
    await userEvent.type(screen.getByLabelText('Password'), PASSWORD);
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await screen.findByText('signed in');
    const sent: unknown = JSON.parse(bodies[0] ?? '{}');
    expect(sent).toMatchObject({ username: 'ada', password: PASSWORD });
    expect((sent as { timezone: string }).timezone).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  });

  it('refuses a password the API would refuse, without a request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    renderScreen('/register');
    await userEvent.type(screen.getByLabelText('Username'), 'ada');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
