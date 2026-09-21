import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../src/features/auth/auth-store';
import { request } from '../src/lib/api/client';

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'ada',
  displayName: null,
  timezone: 'UTC',
  locale: 'en',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  useAuthStore.setState({ status: 'loading', user: null, startupError: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('auth store', () => {
  it('signs in the user the API reports', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(json({ user: USER })));
    await useAuthStore.getState().load();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signed-in', user: USER });
  });

  it('is anonymous when there is no session', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        json({ statusCode: 401, error: 'Unauthorized', message: 'authentication required' }, 401),
      ),
    );
    await useAuthStore.getState().load();
    expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', user: null });
  });

  it('stays loading and reports why when the API cannot be reached', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await useAuthStore.getState().load();
    expect(useAuthStore.getState().status).toBe('loading');
    expect(useAuthStore.getState().startupError).toMatch(/could not be reached/);
  });

  it('clears the session locally when any request is answered 401', async () => {
    useAuthStore.setState({ status: 'signed-in', user: USER, startupError: null });
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        json({ statusCode: 401, error: 'Unauthorized', message: 'authentication required' }, 401),
      ),
    );
    await expect(
      request('/play/sessions', { method: 'POST', body: {}, schema: null }),
    ).rejects.toThrow();
    expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', user: null });
  });

  it('signs out locally even when the logout request fails', async () => {
    useAuthStore.setState({ status: 'signed-in', user: USER, startupError: null });
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(useAuthStore.getState().signOut()).rejects.toThrow();
    expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', user: null });
  });
});
