import type { StartSessionResponse } from '@typing-trainer/contracts';
import { create } from 'zustand';

import { createRunStore, type RunStore } from './run-store';

interface RunSessionState {
  /** The run being played, or null when there is none to play. */
  readonly run: RunStore | null;
  /** Takes an issued run and prepares it; `issuedAt` is when the response arrived. */
  begin: (issued: StartSessionResponse, issuedAt: number) => void;
  clear: () => void;
}

/**
 * Holds the current run between the language screen and the play screen.
 *
 * Deliberately in memory only: a reload leaves no run, the play screen sends the player back to
 * language selection, and the issued run on the server is never submitted — it expires by itself
 * inside the submission window and is deleted a day later (§9.8). Storing it would mean deciding
 * what run time a restored run has, and what a second tab is playing.
 */
export const useRunSession = create<RunSessionState>()((set) => ({
  run: null,

  begin(issued, issuedAt) {
    set({ run: createRunStore(issued, issuedAt) });
  },

  clear() {
    set({ run: null });
  },
}));
