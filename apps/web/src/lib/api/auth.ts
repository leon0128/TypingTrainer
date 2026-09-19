import {
  AuthResponseSchema,
  type LoginRequest,
  type RegisterRequest,
  type User,
} from '@typing-trainer/contracts';

import { request } from './client';
import { ApiRequestError } from './errors';

export async function register(body: RegisterRequest): Promise<User> {
  const { user } = await request('/auth/register', {
    method: 'POST',
    body,
    schema: AuthResponseSchema,
  });
  return user;
}

export async function login(body: LoginRequest): Promise<User> {
  const { user } = await request('/auth/login', {
    method: 'POST',
    body,
    schema: AuthResponseSchema,
  });
  return user;
}

export async function logout(): Promise<void> {
  await request('/auth/logout', { method: 'POST', schema: null });
}

/** The signed-in user, or null when there is no session; every other failure is thrown. */
export async function me(signal?: AbortSignal): Promise<User | null> {
  try {
    const { user } = await request('/auth/me', {
      schema: AuthResponseSchema,
      ...(signal === undefined ? {} : { signal }),
    });
    return user;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return null;
    throw error;
  }
}
