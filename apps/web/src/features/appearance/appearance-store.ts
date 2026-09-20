import { DEFAULT_APPEARANCE, type Appearance } from '@typing-trainer/contracts';
import { create } from 'zustand';

import { describeError } from '../../lib/api/describe-error';
import { getPreferences, updatePreferences } from '../../lib/api/preferences';
import { applyAppearance } from './apply';

interface AppearanceState {
  readonly appearance: Appearance;
  /** The last failure to load or save, for the settings screen to show; null when there is none. */
  readonly error: string | null;
  /** Fetches the signed-in player's appearance and applies it. */
  load: () => Promise<void>;
  /** Applies a change at once and saves it; goes back to what it was if saving fails. */
  change: (patch: Partial<Appearance>) => Promise<void>;
  /** Goes back to the defaults, for when nobody is signed in. */
  reset: () => void;
}

const systemDark = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

/** The settings a patch names, taken from a source that has all of them. */
function pick(source: Appearance, patch: Partial<Appearance>): Partial<Appearance> {
  return Object.fromEntries(
    (Object.keys(patch) as (keyof Appearance)[]).map((key) => [key, source[key]]),
  );
}

/** Saves already queued; each new one waits for the one before, whatever became of it. */
let queue: Promise<void> = Promise.resolve();

export const useAppearance = create<AppearanceState>()((set, get) => {
  /** Puts settled values on screen without touching settings that were changed since. */
  const settle = (values: Partial<Appearance>, error: string | null = null) => {
    set({ appearance: { ...get().appearance, ...values }, ...(error === null ? {} : { error }) });
    applyAppearance(get().appearance, systemDark());
  };

  return {
    appearance: DEFAULT_APPEARANCE,
    error: null,

    async load() {
      try {
        const { font, fontSize, theme, colorPreset } = await getPreferences();
        const appearance = { font, fontSize, theme, colorPreset };
        set({ appearance, error: null });
        applyAppearance(appearance, systemDark());
      } catch (cause) {
        // The defaults stay in place: an unloadable setting must not stop anyone from playing.
        set({ error: describeError(cause) });
      }
    },

    change(patch) {
      const before = get().appearance;
      set({ appearance: { ...before, ...patch }, error: null });
      applyAppearance(get().appearance, systemDark());
      // Saved one at a time and in order, so two quick changes cannot reach the server reversed.
      const saving = queue.then(async () => {
        try {
          const saved = await updatePreferences(patch);
          // What the server stored is what counts, but only for the settings this request carried:
          // a later change may already be on screen, and its own answer will settle it.
          settle(pick(saved, patch));
        } catch (cause) {
          settle(pick(before, patch), describeError(cause));
        }
      });
      queue = saving;
      return saving;
    },

    reset() {
      set({ appearance: DEFAULT_APPEARANCE, error: null });
      applyAppearance(DEFAULT_APPEARANCE, systemDark());
    },
  };
});

/** Re-applies a `system` theme when the operating system's setting changes. */
export function followSystemTheme(): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    const { appearance } = useAppearance.getState();
    if (appearance.theme === 'system') applyAppearance(appearance, query.matches);
  };
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}
