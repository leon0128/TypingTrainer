import type { Appearance, PlayAppearance, Theme } from '@typing-trainer/contracts';

import { loadSkinFonts } from '../../skins/fonts';
import { fontStack, loadFont } from './fonts';
import { PALETTES, type Palette, type ResolvedTheme } from './palettes';

/** `system` becomes light or dark by the operating system's setting (§8.2). */
export function resolveTheme(theme: Theme, systemPrefersDark: boolean): ResolvedTheme {
  if (theme === 'system') return systemPrefersDark ? 'dark' : 'light';
  return theme;
}

/** Custom property names, kept beside the palette keys so a new colour cannot be forgotten. */
const PROPERTIES: Record<keyof Palette, string> = {
  bg: '--bg',
  panel: '--panel',
  border: '--border',
  fg: '--fg',
  muted: '--muted',
  typed: '--typed',
  pending: '--pending',
  autoPending: '--auto-pending',
  cursorBg: '--cursor-bg',
  cursorFg: '--cursor-fg',
  caret: '--caret',
  error: '--error',
  errorFg: '--error-fg',
};

/**
 * What one track's play look sets: its colours, font and size, as custom properties. The play
 * screen and the settings preview put these on their own element, so a track's look never leaks to
 * the page around it (§13.10).
 */
export function playProperties(play: PlayAppearance, theme: ResolvedTheme): Record<string, string> {
  const palette = PALETTES[play.colorPreset][theme];
  const properties: Record<string, string> = {
    '--code-font': fontStack(play.font),
    '--code-size': `${String(play.fontSize)}px`,
  };
  for (const [key, property] of Object.entries(PROPERTIES)) {
    properties[property] = palette[key as keyof Palette];
  }
  return properties;
}

/**
 * Applies the page's appearance to the document: the theme and skin, and the colours as custom
 * properties. The page around the play screen is coloured by the code track's set, the one every
 * account has always had; each track's own look is `playProperties` on its screen.
 */
export function applyAppearance(
  appearance: Appearance,
  codePlay: PlayAppearance,
  systemPrefersDark: boolean,
  root: HTMLElement = document.documentElement,
): void {
  const resolved = resolveTheme(appearance.theme, systemPrefersDark);
  for (const [property, value] of Object.entries(playProperties(codePlay, resolved))) {
    root.style.setProperty(property, value);
  }
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-preset', codePlay.colorPreset);
  root.setAttribute('data-skin', appearance.skin);
  root.style.colorScheme = resolved === 'light' ? 'light' : 'dark';
  void loadFont(codePlay.font);
  void loadSkinFonts(appearance.skin);
}
