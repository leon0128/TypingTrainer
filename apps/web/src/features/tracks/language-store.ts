import type { Language } from '@typing-trainer/contracts';
import { create } from 'zustand';

import { describeError } from '../../lib/api/describe-error';
import { listLanguages } from '../../lib/api/languages';

interface LanguageState {
  /** The languages the server lists for this account, or null before the first answer. */
  readonly languages: Language[] | null;
  readonly error: string | null;
  /** Asks the server, replacing what is held; a failure keeps what was held and says why. */
  load: () => Promise<void>;
  /** Forgets everything, for sign-out. */
  reset: () => void;
}

/**
 * The languages the account may use, as the server lists them (§13.11). The tracks the app offers
 * follow this list and nothing else: the server has already left out what the account may not use,
 * so the web never has to guess from the display language, which it only learns a moment after
 * signing in.
 */
export const useLanguageStore = create<LanguageState>()((set) => ({
  languages: null,
  error: null,

  async load() {
    try {
      set({ languages: await listLanguages(), error: null });
    } catch (cause) {
      set({ error: describeError(cause) });
    }
  },

  reset() {
    set({ languages: null, error: null });
  },
}));
