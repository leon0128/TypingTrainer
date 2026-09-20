import {
  DEFAULT_APPEARANCE,
  DEFAULT_SOUND,
  type Appearance,
  type Sound,
} from '@typing-trainer/contracts';
import { create } from 'zustand';

import { describeError } from '../../lib/api/describe-error';
import { getPreferences, updatePreferences } from '../../lib/api/preferences';
import { soundPlayer } from '../sound/sound';
import { applyAppearance } from './apply';

/** What `PUT /api/preferences` changes that the browser applies: how it looks and how it sounds. */
export type Settings = Appearance & Sound;

interface AppearanceState {
  readonly appearance: Appearance;
  readonly sound: Sound;
  /** The last failure to load or save, for the settings screen to show; null when there is none. */
  readonly error: string | null;
  /** Fetches the signed-in player's settings and applies them. */
  load: () => Promise<void>;
  /** Applies a change at once and saves it; goes back to what it was if saving fails. */
  change: (patch: Partial<Settings>) => Promise<void>;
  /** Goes back to the defaults, for when nobody is signed in. */
  reset: () => void;
}

const systemDark = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

/** The settings a patch names, taken from a source that has all of them. */
function pick(source: Settings, patch: Partial<Settings>): Partial<Settings> {
  return Object.fromEntries(
    (Object.keys(patch) as (keyof Settings)[]).map((key) => [key, source[key]]),
  );
}

function appearanceOf({ font, fontSize, theme, colorPreset }: Settings): Appearance {
  return { font, fontSize, theme, colorPreset };
}

function soundOf({ soundPack, soundVolume }: Settings): Sound {
  return { soundPack, soundVolume };
}

/** Gives the player its pack and volume; the page's colours and fonts are `applyAppearance`'s. */
function applySound(sound: Sound): void {
  soundPlayer.configure({ pack: sound.soundPack, volume: sound.soundVolume });
}

/** Saves already queued; each new one waits for the one before, whatever became of it. */
let queue: Promise<void> = Promise.resolve();

export const useAppearance = create<AppearanceState>()((set, get) => {
  const current = (): Settings => ({ ...get().appearance, ...get().sound });

  /** Puts values on screen and in the player, leaving settings changed since untouched. */
  const show = (values: Partial<Settings>, error: string | null = null) => {
    const merged = { ...current(), ...values };
    set({
      appearance: appearanceOf(merged),
      sound: soundOf(merged),
      ...(error === null ? {} : { error }),
    });
    applyAppearance(appearanceOf(merged), systemDark());
    applySound(soundOf(merged));
  };

  return {
    appearance: DEFAULT_APPEARANCE,
    sound: DEFAULT_SOUND,
    error: null,

    async load() {
      try {
        const saved = await getPreferences();
        set({ error: null });
        show(saved);
      } catch (cause) {
        // The defaults stay in place: an unloadable setting must not stop anyone from playing.
        set({ error: describeError(cause) });
      }
    },

    change(patch) {
      const before = current();
      set({ error: null });
      show(patch);
      // Saved one at a time and in order, so two quick changes cannot reach the server reversed.
      const saving = queue.then(async () => {
        try {
          const saved = await updatePreferences(patch);
          // What the server stored is what counts, but only for the settings this request carried:
          // a later change may already be on screen, and its own answer will settle it.
          show(pick(saved, patch));
        } catch (cause) {
          show(pick(before, patch), describeError(cause));
        }
      });
      queue = saving;
      return saving;
    },

    reset() {
      set({ error: null });
      show({ ...DEFAULT_APPEARANCE, ...DEFAULT_SOUND });
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
