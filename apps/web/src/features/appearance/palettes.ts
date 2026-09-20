import type { ColorPreset } from '@typing-trainer/contracts';

/** What a theme resolves to once `system` has been settled (§8.2). */
export type ResolvedTheme = 'light' | 'dark' | 'high-contrast';

/** Every colour the play screen and the page use, as `#rrggbb`. */
export interface Palette {
  readonly bg: string;
  readonly panel: string;
  readonly border: string;
  readonly fg: string;
  readonly muted: string;
  /** Text already typed, and auto-inserted text once its opening character has been typed. */
  readonly typed: string;
  /** Text still to be typed. */
  readonly pending: string;
  /** Auto-inserted text not yet filled; also marked by a dotted underline. */
  readonly autoPending: string;
  readonly cursorBg: string;
  /** The character under the cursor. */
  readonly cursorFg: string;
  /** The bar at the cursor's left edge. */
  readonly caret: string;
  /** The miss flash; also marked by an outline, so it does not rely on colour alone. */
  readonly error: string;
  /** Text on the miss flash. */
  readonly errorFg: string;
}

/**
 * The colour sets (§8.2). Each is defined for light, dark, and high contrast, and a test holds every
 * combination to the contrast and colour-vision requirements in `palettes.test.ts`.
 *
 * - `standard`: the original look.
 * - `okabe-ito`: blues and oranges from the Okabe–Ito palette, which stay apart for the common
 *   kinds of colour-blindness, where red and green do not.
 * - `monochrome`: greys only; typed text is also bold, so the states differ by lightness and weight.
 */
export const PALETTES: Record<ColorPreset, Record<ResolvedTheme, Palette>> = {
  standard: {
    light: {
      bg: '#f6f8fa',
      panel: '#ffffff',
      border: '#8c959f',
      fg: '#1f2328',
      muted: '#59636e',
      typed: '#1f2328',
      pending: '#6a737d',
      autoPending: '#86909a',
      cursorBg: '#ffe680',
      cursorFg: '#1f2328',
      caret: '#7a4f00',
      error: '#c21e2b',
      errorFg: '#ffffff',
    },
    dark: {
      bg: '#0d1117',
      panel: '#161b22',
      border: '#6e7681',
      fg: '#e6edf3',
      muted: '#9198a1',
      typed: '#e6edf3',
      pending: '#8b949e',
      autoPending: '#6e7681',
      cursorBg: '#4d3800',
      cursorFg: '#e6edf3',
      caret: '#e3b341',
      error: '#ff7b72',
      errorFg: '#0d1117',
    },
    'high-contrast': {
      bg: '#000000',
      panel: '#000000',
      border: '#ffffff',
      fg: '#ffffff',
      muted: '#d0d0d0',
      typed: '#ffffff',
      pending: '#bdbdbd',
      autoPending: '#8f8f8f',
      cursorBg: '#ffea00',
      cursorFg: '#000000',
      caret: '#000000',
      error: '#ff6b6b',
      errorFg: '#000000',
    },
  },
  'okabe-ito': {
    light: {
      bg: '#f4f7fa',
      panel: '#ffffff',
      border: '#7c8b99',
      fg: '#12222f',
      muted: '#4f5f6d',
      typed: '#00355a',
      pending: '#5b6b78',
      autoPending: '#7d8d9b',
      cursorBg: '#ffd99a',
      cursorFg: '#00355a',
      caret: '#8f4700',
      error: '#a83c00',
      errorFg: '#ffffff',
    },
    dark: {
      bg: '#0b1218',
      panel: '#131c24',
      border: '#6c7d8c',
      fg: '#e2eef8',
      muted: '#93a4b3',
      typed: '#d6ecfb',
      pending: '#93a4b3',
      autoPending: '#6b7c8b',
      cursorBg: '#5a3a00',
      cursorFg: '#d6ecfb',
      caret: '#ffb020',
      error: '#ff9d5c',
      errorFg: '#1a0d00',
    },
    'high-contrast': {
      bg: '#000000',
      panel: '#000000',
      border: '#ffffff',
      fg: '#ffffff',
      muted: '#d0d0d0',
      typed: '#9bd7ff',
      pending: '#8c8c8c',
      autoPending: '#6f6f6f',
      cursorBg: '#ffb000',
      cursorFg: '#000000',
      caret: '#000000',
      error: '#ff8a3d',
      errorFg: '#000000',
    },
  },
  monochrome: {
    light: {
      bg: '#f2f2f2',
      panel: '#ffffff',
      border: '#767676',
      fg: '#111111',
      muted: '#4d4d4d',
      typed: '#000000',
      pending: '#595959',
      autoPending: '#808080',
      cursorBg: '#d9d9d9',
      cursorFg: '#000000',
      caret: '#000000',
      error: '#000000',
      errorFg: '#ffffff',
    },
    dark: {
      bg: '#000000',
      panel: '#111111',
      border: '#8c8c8c',
      fg: '#f2f2f2',
      muted: '#a6a6a6',
      typed: '#ffffff',
      pending: '#a6a6a6',
      autoPending: '#737373',
      cursorBg: '#404040',
      cursorFg: '#ffffff',
      caret: '#ffffff',
      error: '#ffffff',
      errorFg: '#000000',
    },
    'high-contrast': {
      bg: '#000000',
      panel: '#000000',
      border: '#ffffff',
      fg: '#ffffff',
      muted: '#d0d0d0',
      typed: '#ffffff',
      pending: '#b0b0b0',
      autoPending: '#8f8f8f',
      cursorBg: '#ffffff',
      cursorFg: '#000000',
      caret: '#000000',
      error: '#ffffff',
      errorFg: '#000000',
    },
  },
};
