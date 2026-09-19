import type { User } from '@typing-trainer/contracts';
import { create } from 'zustand';

import * as authApi from '../../lib/api/auth';
import { describeError } from '../../lib/api/describe-error';
import { onUnauthorized } from '../../lib/api/client';

/** `loading` until the first `GET /api/auth/me` answers; the router waits for it. */
export type AuthStatus = 'loading' | 'anonymous' | 'signed-in';

interface AuthState {
  readonly status: AuthStatus;
  readonly user: User | null;
  /** Why the first `me` request failed, so the startup screen can offer to retry. */
  readonly startupError: string | null;
  /** Asks the API who is signed in. Safe to call twice (React StrictMode mounts twice). */
  load: () => Promise<void>;
  /** Records the user a register or login response returned. */
  signedIn: (user: User) => void;
  /** Ends the session on the server, then locally even if that request failed. */
  signOut: () => Promise<void>;
  /** Drops the local session only, for a session the server no longer accepts. */
  clear: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  status: 'loading',
  user: null,
  startupError: null,

  async load() {
    set({ startupError: null });
    try {
      const user = await authApi.me();
      set(user === null ? { status: 'anonymous', user: null } : { status: 'signed-in', user });
    } catch (error) {
      // The API is unreachable or broken; staying in `loading` keeps the player off a screen
      // that would fail on its first request, and the startup screen offers a retry.
      set({ startupError: describeError(error) });
    }
  },

  signedIn(user) {
    set({ status: 'signed-in', user, startupError: null });
  },

  async signOut() {
    try {
      await authApi.logout();
    } finally {
      set({ status: 'anonymous', user: null });
    }
  },

  clear() {
    set({ status: 'anonymous', user: null });
  },
}));

// A session can end on the server at any time (expiry, sign-out elsewhere); the next 401 drops it
// here too, so the router sends the player to the sign-in screen instead of an empty page.
onUnauthorized(() => {
  useAuthStore.getState().clear();
});
