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

export const useAppearance = create<AppearanceState>()((set, get) => ({
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

  async change(patch) {
    const before = get().appearance;
    const next = { ...before, ...patch };
    set({ appearance: next, error: null });
    applyAppearance(next, systemDark());
    try {
      const { font, fontSize, theme, colorPreset } = await updatePreferences(patch);
      // What the server stored is what counts.
      set({ appearance: { font, fontSize, theme, colorPreset } });
    } catch (cause) {
      set({ appearance: before, error: describeError(cause) });
      applyAppearance(before, systemDark());
    }
  },

  reset() {
    set({ appearance: DEFAULT_APPEARANCE, error: null });
    applyAppearance(DEFAULT_APPEARANCE, systemDark());
  },
}));

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
