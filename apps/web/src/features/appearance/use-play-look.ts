import type { Track } from '@typing-trainer/contracts';
import { useEffect, type CSSProperties } from 'react';

import { useAppearance } from './appearance-store';
import { playProperties, resolveTheme } from './apply';
import { loadFont } from './fonts';

/**
 * What a track's play screen wears (§13.10): the custom properties for its colours, font and size,
 * and the colour set's name for the rules that key on it. Loads the font it names.
 */
export function usePlayLook(track: Track): {
  readonly style: CSSProperties;
  readonly preset: string;
} {
  const theme = useAppearance((state) => state.appearance.theme);
  const play = useAppearance((state) => state.play[track]);
  useEffect(() => {
    void loadFont(play.font);
  }, [play.font]);
  const dark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    style: playProperties(play, resolveTheme(theme, dark)),
    preset: play.colorPreset,
  };
}
