import { COLOR_PRESETS } from '@typing-trainer/contracts';
import { describe, expect, it } from 'vitest';

import {
  COLOR_VISIONS,
  contrast,
  luminance,
  parseHex,
  simulate,
} from '../src/features/appearance/color';
import { PALETTES, type Palette, type ResolvedTheme } from '../src/features/appearance/palettes';

const THEMES: ResolvedTheme[] = ['light', 'dark', 'high-contrast'];

/** The name and `#rrggbb` of every colour in a palette. */
function colorsOf(palette: Palette): [keyof Palette, string][] {
  return (Object.keys(palette) as (keyof Palette)[]).map((name) => [name, palette[name]]);
}

/** A palette as it looks to a viewer, or as it is when `vision` is null. */
function seen(palette: Palette, vision: (typeof COLOR_VISIONS)[number] | null) {
  const rgb = (hex: string) => (vision === null ? parseHex(hex) : simulate(parseHex(hex), vision));
  return Object.fromEntries(colorsOf(palette).map(([name, hex]) => [name, rgb(hex)])) as Record<
    keyof Palette,
    ReturnType<typeof parseHex>
  >;
}

/**
 * The requirements behind "state is never conveyed by color alone" (§8.2, §9.6): every state must
 * stay readable and stay apart from its neighbour by lightness, so a viewer who cannot tell the
 * hues apart still can tell the states apart. They are held for normal vision and for a viewer with
 * no working red, green, or blue cones.
 */
const REQUIREMENTS: { name: string; check: (c: ReturnType<typeof seen>) => number; min: number }[] =
  [
    { name: 'typed text on the panel', check: (c) => contrast(c.typed, c.panel), min: 7 },
    { name: 'pending text on the panel', check: (c) => contrast(c.pending, c.panel), min: 4.5 },
    {
      name: 'unfilled auto text on the panel',
      check: (c) => contrast(c.autoPending, c.panel),
      min: 3,
    },
    {
      name: 'typed against pending, by lightness',
      check: (c) => {
        const [a, b] = [luminance(c.typed), luminance(c.pending)];
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      },
      min: 1.5,
    },
    {
      name: 'the cursor cell against the panel',
      check: (c) => contrast(c.cursorBg, c.panel),
      min: 1.2,
    },
    {
      name: 'the character under the cursor',
      check: (c) => contrast(c.cursorFg, c.cursorBg),
      min: 4.5,
    },
    {
      name: 'the caret bar on the cursor cell',
      check: (c) => contrast(c.caret, c.cursorBg),
      min: 3,
    },
    { name: 'the miss flash against the panel', check: (c) => contrast(c.error, c.panel), min: 3 },
    { name: 'text on the miss flash', check: (c) => contrast(c.errorFg, c.error), min: 4.5 },
    { name: 'page text on the page', check: (c) => contrast(c.fg, c.bg), min: 7 },
    { name: 'secondary text on the page', check: (c) => contrast(c.muted, c.bg), min: 4.5 },
  ];

describe.each(COLOR_PRESETS)('the %s colour set', (preset) => {
  describe.each(THEMES)('in the %s theme', (theme) => {
    const palette = PALETTES[preset][theme];
    for (const vision of [null, ...COLOR_VISIONS]) {
      describe(vision ?? 'for normal colour vision', () => {
        const colours = seen(palette, vision);
        it.each(REQUIREMENTS)('$name reaches $min:1', ({ check, min }) => {
          expect(check(colours)).toBeGreaterThanOrEqual(min);
        });
      });
    }
  });
});

describe('the palettes as a whole', () => {
  it('defines every preset in every theme with #rrggbb colours only', () => {
    for (const preset of COLOR_PRESETS) {
      for (const theme of THEMES) {
        for (const [, hex] of colorsOf(PALETTES[preset][theme])) {
          expect(hex).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });

  it('does not depend on hue where it says it does not: monochrome has equal channels', () => {
    for (const theme of THEMES) {
      for (const [, hex] of colorsOf(PALETTES.monochrome[theme])) {
        const [r, g, b] = parseHex(hex);
        expect(r === g && g === b, hex).toBe(true);
      }
    }
  });
});

describe('the colour model', () => {
  it("gives WCAG's own extremes", () => {
    expect(contrast(parseHex('#000000'), parseHex('#ffffff'))).toBeCloseTo(21, 5);
    expect(contrast(parseHex('#777777'), parseHex('#777777'))).toBe(1);
  });

  it('leaves greys alone and moves red and green for a viewer who cannot tell them apart', () => {
    const grey = parseHex('#808080');
    for (const vision of COLOR_VISIONS) {
      const [r, g, b] = simulate(grey, vision);
      expect(Math.abs(r - 128)).toBeLessThan(2);
      expect(Math.abs(g - 128)).toBeLessThan(2);
      expect(Math.abs(b - 128)).toBeLessThan(2);
    }
    const red = simulate(parseHex('#d00000'), 'deuteranopia');
    const green = simulate(parseHex('#008000'), 'deuteranopia');
    // Simulated, the two land on the same yellowish-brown family: their difference is small next
    // to the difference of the originals.
    const gap = (a: readonly number[], b: readonly number[]) =>
      Math.hypot(...a.map((value, index) => value - (b[index] ?? 0)));
    expect(gap(red, green)).toBeLessThan(gap(parseHex('#d00000'), parseHex('#008000')));
  });
});
