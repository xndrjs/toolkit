import type { Distribution } from "./types";

function percentile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * (index - lower);
}

export function summarize(values: readonly number[]): Distribution {
  if (values.length === 0) {
    return { median: 0, p95: 0, p99: 0, mean: 0, min: 0, max: 0 };
  }
  const sorted = [...values].sort((left, right) => left - right);
  return {
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    min: sorted[0] ?? 0,
    max: sorted.at(-1) ?? 0,
  };
}
