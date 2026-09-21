import { TRACKS, type Language, type Track } from '@typing-trainer/contracts';
import { createContext, useContext, useEffect, useMemo } from 'react';

import { useLanguageStore } from './language-store';

/** The track of the screen being shown; `code` for a screen outside any track, as before. */
export const TrackContext = createContext<Track>('code');

export const useTrack = (): Track => useContext(TrackContext);

/** The tracks the account may use: those the server lists a language for, in the fixed order. */
export function useAvailableTracks(): Track[] | null {
  const languages = useLanguageStore((state) => state.languages);
  return useMemo(() => {
    if (languages === null) return null;
    const present = new Set(languages.map((language) => language.track));
    return TRACKS.filter((track) => present.has(track));
  }, [languages]);
}

/**
 * The languages of the current track, asked for again each time a screen is shown (they can change
 * with the account's display language), and the reason when asking failed.
 */
export function useTrackLanguages(): { languages: Language[] | null; error: string | null } {
  const track = useTrack();
  const all = useLanguageStore((state) => state.languages);
  const error = useLanguageStore((state) => state.error);
  const load = useLanguageStore((state) => state.load);
  useEffect(() => {
    void load();
  }, [load]);
  const languages = useMemo(
    () => (all === null ? null : all.filter((language) => language.track === track)),
    [all, track],
  );
  return { languages, error };
}
