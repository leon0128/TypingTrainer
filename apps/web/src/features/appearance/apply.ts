import type { Appearance, Theme } from '@typing-trainer/contracts';

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
 * Applies an appearance to the document: the colours as custom properties (which the play screen's
 * stylesheet reads), the font and size, and `data-theme` / `data-preset`, which Tailwind's `dark:`
 * variant and the preset-specific rules key on. High contrast counts as dark for Tailwind.
 */
export function applyAppearance(
  appearance: Appearance,
  systemPrefersDark: boolean,
  root: HTMLElement = document.documentElement,
): void {
  const resolved = resolveTheme(appearance.theme, systemPrefersDark);
  const palette = PALETTES[appearance.colorPreset][resolved];
  for (const [key, property] of Object.entries(PROPERTIES)) {
    root.style.setProperty(property, palette[key as keyof Palette]);
  }
  root.style.setProperty('--code-font', fontStack(appearance.font));
  root.style.setProperty('--code-size', `${String(appearance.fontSize)}px`);
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-preset', appearance.colorPreset);
  root.style.colorScheme = resolved === 'light' ? 'light' : 'dark';
  void loadFont(appearance.font);
}
