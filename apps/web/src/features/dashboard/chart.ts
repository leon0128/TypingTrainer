import type { DashboardPoint } from '@typing-trainer/contracts';

export const CHART_WIDTH = 640;
export const CHART_HEIGHT = 240;
const PAD = { left: 44, right: 12, top: 12, bottom: 28 };

export interface PlottedPoint {
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly score: number;
}

export interface Plot {
  readonly points: readonly PlottedPoint[];
  /** Runs of consecutive played points; a null (unplayed) point breaks the line. */
  readonly segments: readonly (readonly PlottedPoint[])[];
  readonly yMax: number;
}

/** A round upper bound so the axis reads cleanly (e.g. 87 -> 100, 240 -> 250). */
export function niceMax(value: number): number {
  if (value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = magnitude / 2;
  return Math.ceil(value / step) * step;
}

/**
 * Lays points out evenly along a category axis — played days with the gaps collapsed (§6.2) — so
 * spacing never reflects elapsed time.
 */
export function plot(points: readonly DashboardPoint[]): Plot {
  const yMax = niceMax(Math.max(0, ...points.map((point) => point.score ?? 0)));
  const innerWidth = CHART_WIDTH - PAD.left - PAD.right;
  const innerHeight = CHART_HEIGHT - PAD.top - PAD.bottom;
  const xAt = (index: number) =>
    PAD.left + (points.length <= 1 ? innerWidth / 2 : (innerWidth * index) / (points.length - 1));
  const yAt = (score: number) => PAD.top + innerHeight * (1 - score / yMax);

  const plotted: PlottedPoint[] = [];
  const segments: PlottedPoint[][] = [];
  let current: PlottedPoint[] | null = null;
  points.forEach((point, index) => {
    if (point.score === null) {
      current = null;
      return;
    }
    const entry = { x: xAt(index), y: yAt(point.score), label: point.x, score: point.score };
    plotted.push(entry);
    if (current === null) {
      current = [];
      segments.push(current);
    }
    current.push(entry);
  });
  return { points: plotted, segments, yMax };
}

export const CHART_PADDING = PAD;
