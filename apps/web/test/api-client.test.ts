import { AuthResponseSchema } from '@typing-trainer/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { onUnauthorized, request, requestMaybe } from '../src/lib/api/client';
import { ApiRequestError, ContractError, NetworkError } from '../src/lib/api/errors';

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'ada',
  timezone: 'UTC',
  locale: 'en',
};

/** Replaces fetch for one test and returns the calls it received. */
function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return Promise.resolve(handler(url, init));
  });
  return calls;
}

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request', () => {
  it('sends JSON to the API path and returns the parsed body', async () => {
    const calls = stubFetch(() => json({ user: USER }));

    await expect(
      request('/auth/login', {
        method: 'POST',
        body: { username: 'ada', password: 'correct horse battery' },
        schema: AuthResponseSchema,
      }),
    ).resolves.toEqual({ user: USER });

    const call = calls[0];
    expect(call?.url).toBe('/api/auth/login');
    expect(call?.init.method).toBe('POST');
    expect(call?.init.credentials).toBe('same-origin');
    expect(call?.init.headers).toEqual({ 'content-type': 'application/json' });
    expect(call?.init.body).toBe(
      JSON.stringify({ username: 'ada', password: 'correct horse battery' }),
    );
  });

  it('sends no body or content type for a plain GET', async () => {
    const calls = stubFetch(() => json({ user: USER }));
    await request('/auth/me', { schema: AuthResponseSchema });
    expect(calls[0]?.init.body).toBeUndefined();
    expect(calls[0]?.init.headers).toEqual({});
  });

  it('returns nothing for a 204 and does not read a body', async () => {
    stubFetch(() => new Response(null, { status: 204 }));
    await expect(
      request('/auth/logout', { method: 'POST', schema: null }),
    ).resolves.toBeUndefined();
  });

  it('raises the API message from an error body', async () => {
    stubFetch(() =>
      json({ statusCode: 409, error: 'Conflict', message: 'username is taken' }, { status: 409 }),
    );
    await expect(
      request('/auth/register', { method: 'POST', body: {}, schema: AuthResponseSchema }),
    ).rejects.toMatchObject({ name: 'ApiRequestError', status: 409, message: 'username is taken' });
  });

  it('falls back to the status text when the error body is not the documented shape', async () => {
    stubFetch(
      () => new Response('<html>gateway</html>', { status: 502, statusText: 'Bad Gateway' }),
    );
    await expect(request('/auth/me', { schema: AuthResponseSchema })).rejects.toThrow(
      'Bad Gateway',
    );
  });

  it('reads Retry-After from a rate-limited response', async () => {
    stubFetch(() =>
      json(
        { statusCode: 429, error: 'Too Many Requests', message: 'too many attempts' },
        {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '42' },
        },
      ),
    );
    const error = await request('/auth/login', {
      method: 'POST',
      body: {},
      schema: AuthResponseSchema,
    }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).retryAfterSec).toBe(42);
  });

  it('tells listeners about a 401, so the client can drop the session', async () => {
    stubFetch(() =>
      json(
        { statusCode: 401, error: 'Unauthorized', message: 'authentication required' },
        { status: 401 },
      ),
    );
    const seen = vi.fn();
    const remove = onUnauthorized(seen);
    await expect(request('/auth/me', { schema: AuthResponseSchema })).rejects.toBeInstanceOf(
      ApiRequestError,
    );
    remove();
    expect(seen).toHaveBeenCalledOnce();
  });

  it('answers null for a 204 when the caller allows one, and the body otherwise', async () => {
    stubFetch(() => new Response(null, { status: 204 }));
    await expect(
      requestMaybe('/play/sessions/x/result', { method: 'POST', schema: AuthResponseSchema }),
    ).resolves.toBeNull();

    stubFetch(() => json({ user: USER }));
    await expect(requestMaybe('/auth/me', { schema: AuthResponseSchema })).resolves.toEqual({
      user: USER,
    });
  });

  it('still raises for an error response when a 204 would be allowed', async () => {
    stubFetch(() =>
      json(
        { statusCode: 422, error: 'Unprocessable Entity', message: 'result rejected: speed' },
        { status: 422 },
      ),
    );
    await expect(
      requestMaybe('/play/sessions/x/result', { method: 'POST', schema: AuthResponseSchema }),
    ).rejects.toMatchObject({ status: 422, message: 'result rejected: speed' });
  });

  it('raises a network error when the request never reached the server', async () => {
    stubFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(request('/auth/me', { schema: AuthResponseSchema })).rejects.toBeInstanceOf(
      NetworkError,
    );
  });

  it('raises a contract error when the response does not match the schema', async () => {
    stubFetch(() => json({ user: { id: 'not-a-uuid' } }));
    await expect(request('/auth/me', { schema: AuthResponseSchema })).rejects.toBeInstanceOf(
      ContractError,
    );
  });
});
