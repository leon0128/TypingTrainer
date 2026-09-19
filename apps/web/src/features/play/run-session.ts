import type { PlayRun, StartSessionResponse } from '@typing-trainer/contracts';
import { create } from 'zustand';

import { ApiRequestError, NetworkError } from '../../lib/api/errors';
import { describeError } from '../../lib/api/describe-error';
import { submitResult } from '../../lib/api/play';
import { createRunStore, type RunStore } from './run-store';

/** What became of the run once it ended (§9.8). */
export type Submission =
  | { readonly kind: 'unsent' }
  | { readonly kind: 'sending' }
  /** Stored: these are the numbers the server recomputed from the log. */
  | { readonly kind: 'saved'; readonly run: PlayRun }
  /** No keystroke to score: the server answered 204 and stored nothing. */
  | { readonly kind: 'empty' }
  /** Left idle past the limit (§4.1): never sent, never saved. */
  | { readonly kind: 'discarded' }
  | { readonly kind: 'failed'; readonly message: string; readonly canRetry: boolean };

interface RunSessionState {
  /** The run being played, or null when there is none to play. */
  readonly run: RunStore | null;
  readonly submission: Submission;
  /** Takes an issued run and prepares it; `issuedAt` is when the response arrived. */
  begin: (issued: StartSessionResponse, issuedAt: number) => void;
  /** Sends the finished run's log, once. A run ended by the idle limit is not sent at all. */
  submit: () => Promise<void>;
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
export const useRunSession = create<RunSessionState>()((set, get) => ({
  run: null,
  submission: { kind: 'unsent' },

  begin(issued, issuedAt) {
    set({ run: createRunStore(issued, issuedAt), submission: { kind: 'unsent' } });
  },

  async submit() {
    const { run, submission } = get();
    if (run === null) return;
    // Sent once: the server marks the run submitted before it judges the result, so a second
    // attempt could never store anything anyway.
    if (submission.kind !== 'unsent' && !(submission.kind === 'failed' && submission.canRetry)) {
      return;
    }
    const snapshot = run.getSnapshot();
    if (snapshot.phase !== 'ended') return;
    if (snapshot.endedBy === 'idle') {
      set({ submission: { kind: 'discarded' } });
      return;
    }

    set({ submission: { kind: 'sending' } });
    try {
      const stored = await submitResult(run.issued.sessionId, run.buildLog());
      set({ submission: stored === null ? { kind: 'empty' } : { kind: 'saved', run: stored } });
    } catch (error) {
      set({ submission: failure(error) });
    }
  },

  clear() {
    set({ run: null, submission: { kind: 'unsent' } });
  },
}));

/**
 * A failed submission, and whether sending it again could help. Only a request that never reached
 * the server can be retried; the server's own answers are final, because the run is used up by
 * the attempt — including a retry that finds it already submitted.
 */
function failure(error: unknown): Submission {
  if (error instanceof NetworkError) {
    return { kind: 'failed', message: describeError(error), canRetry: true };
  }
  if (error instanceof ApiRequestError && error.status === 409) {
    return {
      kind: 'failed',
      message: 'The server already has this run, so it cannot be submitted again.',
      canRetry: false,
    };
  }
  return { kind: 'failed', message: describeError(error), canRetry: false };
}
