import {
  AuthResponseSchema,
  type LoginRequest,
  type RegisterRequest,
  type UpdateProfileRequest,
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

/** Sets the display name, or clears it with null so the username shows again. */
export async function updateDisplayName(
  displayName: UpdateProfileRequest['displayName'],
): Promise<User> {
  const { user } = await request('/auth/me', {
    method: 'PATCH',
    body: { displayName },
    schema: AuthResponseSchema,
  });
  return user;
}

/**
 * Erases the account and everything of theirs, after the password is given again (§7, Q19). A wrong
 * password is a 403, which is thrown like any other refusal: it is not a 401, so it does not sign
 * the person out.
 */
export async function deleteAccount(password: string): Promise<void> {
  await request('/auth/me', { method: 'DELETE', body: { password }, schema: null });
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
