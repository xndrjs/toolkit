/**
 * Percentile / distribution helpers for bench repeats.
 * Pattern matches `apps/bench-perf/src/runner/stats.ts` (linear interpolation).
 */

export type PercentileSummary = {
  readonly median: number;
  readonly p95: number;
  readonly p99: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
  readonly count: number;
};

export type DistributionStats = PercentileSummary;

/**
 * Effective size buckets relative to the configured max for a source.
 *
 * - `eq1`: size ≤ 1
 * - `lteHalf`: 1 < size ≤ 50% of configured max
 * - `belowFull`: 50% < size < configured max
 * - `full`: size ≥ configured max
 * - `unknown`: no configured max
 */
export type EffectiveBatchFillHistogram = {
  readonly configuredMax: number | undefined;
  readonly eq1: number;
  readonly lteHalf: number;
  readonly belowFull: number;
  readonly full: number;
  readonly unknown: number;
  readonly total: number;
};

/** Per-source fields needed to aggregate across measured repeats. */
export type SourceRunMetricsLike = {
  readonly sourceId: string;
  readonly batchCount: number;
  readonly effectiveBatchSize: DistributionStats;
  readonly sumBatchDurationMs: number;
  readonly maxBatchDurationMs: number;
  readonly fillHistogram: EffectiveBatchFillHistogram;
};

/** Per-run fields needed to aggregate across measured repeats. */
export type ResolutionRunMetricsLike = {
  readonly wallMs: number;
  readonly batchCount: number;
  readonly resolvedCount: number;
  readonly maxInFlightBatches: number;
  readonly overlapMs: number;
  readonly bySource: Readonly<Record<string, SourceRunMetricsLike>>;
};

export type SourceMetricsSummary = {
  readonly sourceId: string;
  readonly batchCount: PercentileSummary;
  /** Per-run mean effective size, then percentiles across repeats. */
  readonly effectiveBatchSizeMean: PercentileSummary;
  /** Per-run median effective size, then percentiles across repeats. */
  readonly effectiveBatchSizeMedian: PercentileSummary;
  /** Per-run p95 effective size, then percentiles across repeats. */
  readonly effectiveBatchSizeP95: PercentileSummary;
  readonly sumBatchDurationMs: PercentileSummary;
  readonly maxBatchDurationMs: PercentileSummary;
  /** Fill histogram summed across repeats (raw batch counts). */
  readonly fillHistogram: EffectiveBatchFillHistogram;
};

export type RunsMetricsSummary = {
  readonly repeats: number;
  readonly wallMs: PercentileSummary;
  readonly batchCount: PercentileSummary;
  readonly resolvedCount: PercentileSummary;
  readonly maxInFlightBatches: PercentileSummary;
  readonly overlapMs: PercentileSummary;
  readonly bySource: Readonly<Record<string, SourceMetricsSummary>>;
};

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

/** Median / p95 / p99 (+ mean/min/max) over a sample. Empty → zeros. */
export function summarize(values: readonly number[]): PercentileSummary {
  if (values.length === 0) {
    return { median: 0, p95: 0, p99: 0, mean: 0, min: 0, max: 0, count: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, value) => acc + value, 0);

  return {
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    mean: sum / values.length,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    count: values.length,
  };
}

/** Alias used when describing a single-run size/duration distribution. */
export function distributionOf(values: readonly number[]): DistributionStats {
  return summarize(values);
}

/**
 * Buckets effective batch sizes against a configured max.
 * When `configuredMax` is missing or ≤ 0, all sizes land in `unknown`.
 */
export function fillHistogram(
  sizes: readonly number[],
  configuredMax: number | undefined
): EffectiveBatchFillHistogram {
  let eq1 = 0;
  let lteHalf = 0;
  let belowFull = 0;
  let full = 0;
  let unknown = 0;

  const max = configuredMax !== undefined && configuredMax > 0 ? configuredMax : undefined;
  const half = max === undefined ? undefined : max * 0.5;

  for (const size of sizes) {
    if (max === undefined || half === undefined) {
      unknown += 1;
      continue;
    }
    if (size <= 1) {
      eq1 += 1;
    } else if (size <= half) {
      lteHalf += 1;
    } else if (size < max) {
      belowFull += 1;
    } else {
      full += 1;
    }
  }

  return {
    configuredMax: max,
    eq1,
    lteHalf,
    belowFull,
    full,
    unknown,
    total: sizes.length,
  };
}

function mergeFillHistograms(
  histograms: readonly EffectiveBatchFillHistogram[]
): EffectiveBatchFillHistogram {
  if (histograms.length === 0) {
    return {
      configuredMax: undefined,
      eq1: 0,
      lteHalf: 0,
      belowFull: 0,
      full: 0,
      unknown: 0,
      total: 0,
    };
  }

  let eq1 = 0;
  let lteHalf = 0;
  let belowFull = 0;
  let full = 0;
  let unknown = 0;
  let total = 0;
  const configuredMax = histograms[0]?.configuredMax;

  for (const h of histograms) {
    eq1 += h.eq1;
    lteHalf += h.lteHalf;
    belowFull += h.belowFull;
    full += h.full;
    unknown += h.unknown;
    total += h.total;
  }

  return { configuredMax, eq1, lteHalf, belowFull, full, unknown, total };
}

function summarizeSourceAcrossRuns(
  sourceId: string,
  runs: readonly SourceRunMetricsLike[]
): SourceMetricsSummary {
  return {
    sourceId,
    batchCount: summarize(runs.map((r) => r.batchCount)),
    effectiveBatchSizeMean: summarize(runs.map((r) => r.effectiveBatchSize.mean)),
    effectiveBatchSizeMedian: summarize(runs.map((r) => r.effectiveBatchSize.median)),
    effectiveBatchSizeP95: summarize(runs.map((r) => r.effectiveBatchSize.p95)),
    sumBatchDurationMs: summarize(runs.map((r) => r.sumBatchDurationMs)),
    maxBatchDurationMs: summarize(runs.map((r) => r.maxBatchDurationMs)),
    fillHistogram: mergeFillHistograms(runs.map((r) => r.fillHistogram)),
  };
}

/**
 * Aggregates measured repeats for one matrix cell.
 *
 * Effective batch size: mean / median / p95 are computed per run, then
 * summarized across repeats (median of those is the headline comparison value).
 */
export function summarizeRuns(runs: readonly ResolutionRunMetricsLike[]): RunsMetricsSummary {
  const sourceIds = new Set<string>();
  for (const run of runs) {
    for (const sourceId of Object.keys(run.bySource)) {
      sourceIds.add(sourceId);
    }
  }

  const bySource: Record<string, SourceMetricsSummary> = {};
  for (const sourceId of sourceIds) {
    const sourceRuns = runs
      .map((run) => run.bySource[sourceId])
      .filter((metrics): metrics is SourceRunMetricsLike => metrics !== undefined);
    bySource[sourceId] = summarizeSourceAcrossRuns(sourceId, sourceRuns);
  }

  return {
    repeats: runs.length,
    wallMs: summarize(runs.map((r) => r.wallMs)),
    batchCount: summarize(runs.map((r) => r.batchCount)),
    resolvedCount: summarize(runs.map((r) => r.resolvedCount)),
    maxInFlightBatches: summarize(runs.map((r) => r.maxInFlightBatches)),
    overlapMs: summarize(runs.map((r) => r.overlapMs)),
    bySource,
  };
}
