import type { Font } from '@typing-trainer/contracts';

/** The generic fallback while a font loads, and for a glyph it lacks. */
const FALLBACK = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

interface FontDefinition {
  /** The CSS family the font's own stylesheet declares. */
  readonly family: string;
  /** Loads the font's stylesheet, and with it the font files, which are bundled with the app. */
  readonly load: () => Promise<unknown>;
}

/**
 * The code fonts (§8.2). All are open source (SIL OFL 1.1) and shipped inside the app: a font is
 * fetched from this origin, never from a CDN, so the app works on an offline network. Only the
 * Latin 400 weight is bundled, since code is ASCII (§5.1) and the play screen uses no other weight.
 * Each is imported on demand, so a player downloads only the one they use.
 */
const FONT_DEFINITIONS: Record<Font, FontDefinition> = {
  'jetbrains-mono': {
    family: 'JetBrains Mono',
    load: () => import('@fontsource/jetbrains-mono/latin-400.css'),
  },
  'fira-code': {
    family: 'Fira Code',
    load: () => import('@fontsource/fira-code/latin-400.css'),
  },
  'source-code-pro': {
    family: 'Source Code Pro',
    load: () => import('@fontsource/source-code-pro/latin-400.css'),
  },
  'ibm-plex-mono': {
    family: 'IBM Plex Mono',
    load: () => import('@fontsource/ibm-plex-mono/latin-400.css'),
  },
  'noto-sans-mono': {
    family: 'Noto Sans Mono',
    load: () => import('@fontsource/noto-sans-mono/latin-400.css'),
  },
  // The Japanese track's fonts (§13.10): their Latin part draws the romaji, their Japanese part the
  // text above it. The Japanese stylesheet is many small slices that the browser fetches only for
  // the characters it draws, so a block costs a few of them, not the whole font.
  'm-plus-1-code': {
    family: 'M PLUS 1 Code',
    load: () =>
      Promise.all([
        import('@fontsource/m-plus-1-code/latin-400.css'),
        import('@fontsource/m-plus-1-code/japanese-400.css'),
      ]),
  },
  'biz-ud-gothic': {
    family: 'BIZ UDGothic',
    load: () =>
      Promise.all([
        import('@fontsource/biz-udgothic/latin-400.css'),
        import('@fontsource/biz-udgothic/japanese-400.css'),
      ]),
  },
};

/** The value of `font-family` for a font. */
export function fontStack(font: Font): string {
  return `'${FONT_DEFINITIONS[font].family}', ${FALLBACK}`;
}

export const FONT_LABELS: Record<Font, string> = {
  'jetbrains-mono': 'JetBrains Mono',
  'fira-code': 'Fira Code',
  'source-code-pro': 'Source Code Pro',
  'ibm-plex-mono': 'IBM Plex Mono',
  'noto-sans-mono': 'Noto Sans Mono',
  'm-plus-1-code': 'M PLUS 1 Code',
  'biz-ud-gothic': 'BIZ UDGothic',
};

const loading = new Map<Font, Promise<unknown>>();

/** Starts loading a font once; resolves when its stylesheet is in, and never rejects. */
export function loadFont(font: Font): Promise<unknown> {
  let pending = loading.get(font);
  if (pending === undefined) {
    // A font that cannot be loaded leaves the fallback in place rather than breaking the app.
    pending = FONT_DEFINITIONS[font].load().catch(() => undefined);
    loading.set(font, pending);
  }
  return pending;
}
