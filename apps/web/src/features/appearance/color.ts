/** Colour maths for checking that a palette can be read (WCAG 2.x contrast, colour-vision models). */

export type Rgb = readonly [number, number, number];

export function parseHex(hex: string): Rgb {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) throw new RangeError(`not a #rrggbb colour: ${hex}`);
  return [
    Number.parseInt(match[1] ?? '0', 16),
    Number.parseInt(match[2] ?? '0', 16),
    Number.parseInt(match[3] ?? '0', 16),
  ];
}

const toLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (value: number): number => {
  const c = Math.min(1, Math.max(0, value));
  return 255 * (c <= 0.003_130_8 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
};

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb;
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio of two colours, 1 (identical) to 21 (black on white). */
export function contrast(first: Rgb, second: Rgb): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

export type ColorVision = 'protanopia' | 'deuteranopia' | 'tritanopia';

/**
 * Machado, Oliveira and Fernandes (2009), full severity, applied to linear RGB: how a colour looks
 * to someone with no working L (protan), M (deutan), or S (tritan) cones.
 */
const MACHADO: Record<ColorVision, readonly (readonly [number, number, number])[]> = {
  protanopia: [
    [0.152_286, 1.052_583, -0.204_868],
    [0.114_503, 0.786_281, 0.099_216],
    [-0.003_882, -0.048_116, 1.051_998],
  ],
  deuteranopia: [
    [0.367_322, 0.860_646, -0.227_968],
    [0.280_085, 0.672_501, 0.047_413],
    [-0.011_82, 0.042_94, 0.968_881],
  ],
  tritanopia: [
    [1.255_528, -0.076_749, -0.178_779],
    [-0.078_411, 0.930_809, 0.147_602],
    [0.004_733, 0.691_367, 0.303_9],
  ],
};

export const COLOR_VISIONS = Object.keys(MACHADO) as ColorVision[];

export function simulate(rgb: Rgb, vision: ColorVision): Rgb {
  const linear = rgb.map(toLinear) as [number, number, number];
  const [r, g, b] = MACHADO[vision].map(
    (row) => row[0] * linear[0] + row[1] * linear[1] + row[2] * linear[2],
  ) as [number, number, number];
  return [fromLinear(r), fromLinear(g), fromLinear(b)];
}
