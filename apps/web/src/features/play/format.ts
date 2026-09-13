export const formatSeconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

export const formatPercent = (ratio: number): string => `${(ratio * 100).toFixed(1)} %`;

export const formatMs = (ms: number): string => `${ms.toFixed(1)} ms`;
