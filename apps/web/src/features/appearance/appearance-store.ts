import {
  DEFAULT_APPEARANCE,
  DEFAULT_PLAY_APPEARANCE,
  DEFAULT_SOUND,
  type Appearance,
  type Locale,
  type PlayAppearance,
  type Sound,
  type Track,
} from '@typing-trainer/contracts';
import { create } from 'zustand';

import { describeError } from '../../lib/api/describe-error';
import { getPreferences, updatePreferences } from '../../lib/api/preferences';
import { applyLocale, detectLocale } from '../../i18n';
import { soundPlayer } from '../sound/sound';
import { applyAppearance } from './apply';

/** What `PUT /api/preferences` changes that the browser applies: how it looks, sounds, and reads. */
export type Settings = Appearance & Sound & { readonly locale: Locale };

/** The play look of every track; one the server did not send is at its defaults. */
export type PlayLooks = Record<Track, PlayAppearance>;

interface AppearanceState {
  readonly appearance: Appearance;
  readonly play: PlayLooks;
  readonly sound: Sound;
  /** The interface language (§8.4). */
  readonly locale: Locale;
  /** The last failure to load or save, for the settings screen to show; null when there is none. */
  readonly error: string | null;
  /** Fetches the signed-in player's settings and applies them. */
  load: () => Promise<void>;
  /** Applies a change at once and saves it; goes back to what it was if saving fails. */
  change: (patch: Partial<Settings>) => Promise<void>;
  /** Changes one track's play look the same way: at once, saved in order, undone on failure. */
  changePlay: (track: Track, patch: Partial<PlayAppearance>) => Promise<void>;
  /** Changes the language for this visit only, for the sign-in and registration screens. */
  setLocaleLocally: (locale: Locale) => void;
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

function appearanceOf({ theme, skin }: Settings): Appearance {
  return { theme, skin };
}

function soundOf({ soundPack, soundVolume }: Settings): Sound {
  return { soundPack, soundVolume };
}

/** The language a visit starts in: the browser's, until an account says otherwise (§8.4). */
export const browserLocale = (): Locale => detectLocale();

/** Gives the player its pack and volume; the page's colours and fonts are `applyAppearance`'s. */
function applySound(sound: Sound): void {
  soundPlayer.configure({ pack: sound.soundPack, volume: sound.soundVolume });
}

/** Saves already queued; each new one waits for the one before, whatever became of it. */
let queue: Promise<void> = Promise.resolve();

/** Resolves once every save queued so far has been answered, whatever became of it. */
export const whenSaved = (): Promise<void> => queue;

export const useAppearance = create<AppearanceState>()((set, get) => {
  const current = (): Settings => ({
    ...get().appearance,
    ...get().sound,
    locale: get().locale,
  });

  /** Puts values on screen and in the player, leaving settings changed since untouched. */
  const show = (
    values: Partial<Settings>,
    error: string | null = null,
    play: PlayLooks = get().play,
  ) => {
    const merged = { ...current(), ...values };
    set({
      appearance: appearanceOf(merged),
      sound: soundOf(merged),
      locale: merged.locale,
      play,
      ...(error === null ? {} : { error }),
    });
    applyAppearance(appearanceOf(merged), play.code, systemDark());
    applySound(soundOf(merged));
    void applyLocale(merged.locale);
  };

  return {
    appearance: DEFAULT_APPEARANCE,
    play: DEFAULT_PLAY_APPEARANCE,
    sound: DEFAULT_SOUND,
    locale: browserLocale(),
    error: null,

    async load() {
      try {
        const saved = await getPreferences();
        set({ error: null });
        show(saved, null, {
          code: saved.play.code,
          'natural-en': saved.play['natural-en'],
          'natural-ja': saved.play['natural-ja'] ?? DEFAULT_PLAY_APPEARANCE['natural-ja'],
        });
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

    changePlay(track, patch) {
      const before = get().play[track];
      set({ error: null });
      show({}, null, { ...get().play, [track]: { ...before, ...patch } });
      const saving = queue.then(async () => {
        try {
          const saved = (await updatePreferences({ play: { track, ...patch } })).play[track];
          // Only what this request carried is taken from the answer, as `change` does.
          if (saved !== undefined) {
            const kept = Object.fromEntries(
              (Object.keys(patch) as (keyof PlayAppearance)[]).map((key) => [key, saved[key]]),
            );
            show({}, null, { ...get().play, [track]: { ...get().play[track], ...kept } });
          }
        } catch (cause) {
          const undone = Object.fromEntries(
            (Object.keys(patch) as (keyof PlayAppearance)[]).map((key) => [key, before[key]]),
          );
          show({}, describeError(cause), {
            ...get().play,
            [track]: { ...get().play[track], ...undone },
          });
        }
      });
      queue = saving;
      return saving;
    },

    setLocaleLocally(locale) {
      set({ locale });
      void applyLocale(locale);
    },

    reset() {
      set({ error: null });
      show(
        { ...DEFAULT_APPEARANCE, ...DEFAULT_SOUND, locale: browserLocale() },
        null,
        DEFAULT_PLAY_APPEARANCE,
      );
    },
  };
});

/** Re-applies a `system` theme when the operating system's setting changes. */
export function followSystemTheme(): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    const { appearance, play } = useAppearance.getState();
    if (appearance.theme === 'system') applyAppearance(appearance, play.code, query.matches);
  };
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}
