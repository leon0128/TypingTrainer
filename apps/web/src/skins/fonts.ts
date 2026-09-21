import type { Skin } from '@typing-trainer/contracts';

/**
 * The fonts a skin's headings and labels use, loaded on demand like the code fonts so a player
 * downloads only the skin they chose. All are bundled with the app (SIL OFL 1.1), never fetched from
 * a CDN. Each skin's Japanese text falls back through `--sk-font` in skins.css.
 */
const SKIN_FONTS: Record<Skin, readonly (() => Promise<unknown>)[]> = {
  classic: [],
  neon: [() => import('@fontsource/orbitron/700.css')],
  pixel: [
    () => import('@fontsource/press-start-2p/400.css'),
    () => import('@fontsource/dotgothic16/400.css'),
  ],
  fantasy: [
    () => import('@fontsource/cinzel/700.css'),
    () => import('@fontsource/zen-old-mincho/500.css'),
  ],
  pop: [
    () => import('@fontsource/fredoka/500.css'),
    () => import('@fontsource/zen-maru-gothic/500.css'),
  ],
};

const loaded = new Set<Skin>();

/** Starts loading a skin's fonts; the page shows its fallback until they arrive. */
export function loadSkinFonts(skin: Skin): Promise<unknown> {
  if (loaded.has(skin)) return Promise.resolve();
  loaded.add(skin);
  return Promise.all(SKIN_FONTS[skin].map((load) => load())).catch(() => {
    loaded.delete(skin);
  });
}
