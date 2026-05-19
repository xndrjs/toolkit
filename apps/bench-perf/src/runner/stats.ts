import type { SummaryMetric } from "./types";

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  if (sorted.length === 1) {
    return sorted[0] ?? 0;
  }
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower] ?? 0;
  }
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? 0;
  const weight = index - lower;
  return lowerValue + (upperValue - lowerValue) * weight;
}

export function summarize(values: readonly number[]): SummaryMetric {
  if (values.length === 0) {
    return { median: 0, p95: 0, p99: 0, variance: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
  const variance =
    values.reduce((acc, value) => {
      const delta = value - mean;
      return acc + delta * delta;
    }, 0) / values.length;

  return {
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    variance,
  };
}
