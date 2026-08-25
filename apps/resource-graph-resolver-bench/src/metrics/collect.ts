import type {
  ResolutionObserver,
  ResourceBatchEndEvent,
  ResourceBatchErrorEvent,
  ResourceBatchStartEvent,
  ResolutionEndEvent,
  ResolutionStartEvent,
} from "@xndrjs/resource-graph-resolver";

import {
  distributionOf,
  fillHistogram,
  type DistributionStats,
  type EffectiveBatchFillHistogram,
} from "./summarize";

export type MetricsCollectorOptions = {
  /**
   * Configured max batch size per `sourceId` (e.g. cms → 100).
   * Used to bucket effective sizes as fractions of that cap.
   */
  readonly configuredBatchSizeBySource?: Readonly<Record<string, number>>;
};

export type BatchInterval = {
  readonly sourceId: string;
  readonly batchNumber: number;
  /** `performance.now()` when `onBatchStart` fired. */
  readonly startedAt: number;
  /** `performance.now()` when `onBatchEnd` / `onBatchError` fired. */
  readonly endedAt: number;
  readonly resourceCount: number;
  readonly durationMs: number;
  readonly ok: boolean;
  /** Family → ARI count as handed to the source. */
  readonly resourcesByFamily: Readonly<Record<string, number>>;
};

export type SourceRunMetrics = {
  readonly sourceId: string;
  readonly batchCount: number;
  readonly effectiveBatchSizes: readonly number[];
  readonly batchDurationMs: readonly number[];
  readonly sumBatchDurationMs: number;
  readonly maxBatchDurationMs: number;
  readonly effectiveBatchSize: DistributionStats;
  readonly fillHistogram: EffectiveBatchFillHistogram;
};

export type ResolutionRunMetrics = {
  readonly strategy: string | undefined;
  readonly wallMs: number;
  readonly resolvedCount: number;
  readonly errorCount: number;
  readonly promotedCount: number;
  /** Total completed batches (ok + error). */
  readonly batchCount: number;
  readonly batches: readonly BatchInterval[];
  readonly bySource: Readonly<Record<string, SourceRunMetrics>>;
  /** Peak concurrent in-flight batches during the run. */
  readonly maxInFlightBatches: number;
  /**
   * Wall time (ms) during which ≥2 batches were in flight simultaneously.
   * Useful for lane vs barrier: lane can overlap CMS and integration loads.
   */
  readonly overlapMs: number;
};

export type MetricsCollector = {
  readonly observer: ResolutionObserver;
  /** Aggregate counters / timelines collected so far (or since last {@link reset}). */
  snapshot(): ResolutionRunMetrics;
  reset(): void;
};

type OpenBatch = {
  readonly sourceId: string;
  readonly batchNumber: number;
  readonly startedAt: number;
  readonly resourceCount: number;
  readonly resourcesByFamily: Readonly<Record<string, number>>;
};

function batchKey(sourceId: string, batchNumber: number): string {
  return `${sourceId}#${batchNumber}`;
}

function familyCounts(
  resourcesByFamily: Readonly<Record<string, readonly unknown[]>>
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const [family, resources] of Object.entries(resourcesByFamily)) {
    counts[family] = resources.length;
  }
  return counts;
}

/**
 * Sweep-line overlap: sum of timeline spans where `inFlight >= 2`.
 */
export function computeOverlapMs(batches: readonly BatchInterval[]): number {
  if (batches.length < 2) {
    return 0;
  }

  type Edge = { readonly at: number; readonly delta: number };
  const edges: Edge[] = [];
  for (const batch of batches) {
    edges.push({ at: batch.startedAt, delta: 1 });
    edges.push({ at: batch.endedAt, delta: -1 });
  }

  edges.sort((a, b) => a.at - b.at || a.delta - b.delta);

  let inFlight = 0;
  let overlapMs = 0;
  let prevAt = edges[0]?.at ?? 0;

  for (const edge of edges) {
    if (inFlight >= 2 && edge.at > prevAt) {
      overlapMs += edge.at - prevAt;
    }
    inFlight += edge.delta;
    prevAt = edge.at;
  }

  return overlapMs;
}

function buildSourceMetrics(
  sourceId: string,
  batches: readonly BatchInterval[],
  configuredMax: number | undefined
): SourceRunMetrics {
  const effectiveBatchSizes = batches.map((b) => b.resourceCount);
  const batchDurationMs = batches.map((b) => b.durationMs);
  let sumBatchDurationMs = 0;
  let maxBatchDurationMs = 0;
  for (const duration of batchDurationMs) {
    sumBatchDurationMs += duration;
    if (duration > maxBatchDurationMs) {
      maxBatchDurationMs = duration;
    }
  }

  return {
    sourceId,
    batchCount: batches.length,
    effectiveBatchSizes,
    batchDurationMs,
    sumBatchDurationMs,
    maxBatchDurationMs,
    effectiveBatchSize: distributionOf(effectiveBatchSizes),
    fillHistogram: fillHistogram(effectiveBatchSizes, configuredMax),
  };
}

/**
 * Builds a {@link ResolutionObserver} that records wall clock, batch sizes,
 * durations, and in-flight overlap for one resolve call.
 *
 * Call {@link MetricsCollector.reset} between warmup/repeats so each snapshot
 * is independent. Pass configured batch caps so fill histograms are meaningful.
 */
export function createMetricsCollector(options: MetricsCollectorOptions = {}): MetricsCollector {
  const configuredBatchSizeBySource = options.configuredBatchSizeBySource ?? {};

  let strategy: string | undefined;
  let wallMs = 0;
  let resolvedCount = 0;
  let errorCount = 0;
  let promotedCount = 0;
  let maxInFlightBatches = 0;
  let inFlight = 0;
  const open = new Map<string, OpenBatch>();
  const batches: BatchInterval[] = [];

  const reset = (): void => {
    strategy = undefined;
    wallMs = 0;
    resolvedCount = 0;
    errorCount = 0;
    promotedCount = 0;
    maxInFlightBatches = 0;
    inFlight = 0;
    open.clear();
    batches.length = 0;
  };

  const closeBatch = (
    event: ResourceBatchEndEvent | ResourceBatchErrorEvent,
    ok: boolean
  ): void => {
    const key = batchKey(event.sourceId, event.batchNumber);
    const started = open.get(key);
    open.delete(key);
    inFlight = Math.max(0, inFlight - 1);

    const endedAt = performance.now();
    const startedAt = started?.startedAt ?? endedAt - event.durationMs;
    const resourceCount = started?.resourceCount ?? event.requestedCount;
    const resourcesByFamily = started?.resourcesByFamily ?? {};

    batches.push({
      sourceId: event.sourceId,
      batchNumber: event.batchNumber,
      startedAt,
      endedAt,
      resourceCount,
      durationMs: event.durationMs,
      ok,
      resourcesByFamily,
    });
  };

  const observer: ResolutionObserver = {
    onResolutionStart(event: ResolutionStartEvent): void {
      strategy = event.strategy;
    },

    onResolutionEnd(event: ResolutionEndEvent): void {
      wallMs = event.durationMs;
      resolvedCount = event.resolvedCount;
      errorCount = event.errorCount;
      promotedCount = event.promotedCount;
    },

    onBatchStart(event: ResourceBatchStartEvent): void {
      const key = batchKey(event.sourceId, event.batchNumber);
      open.set(key, {
        sourceId: event.sourceId,
        batchNumber: event.batchNumber,
        startedAt: performance.now(),
        resourceCount: event.resourceCount,
        resourcesByFamily: familyCounts(event.resourcesByFamily),
      });
      inFlight += 1;
      if (inFlight > maxInFlightBatches) {
        maxInFlightBatches = inFlight;
      }
    },

    onBatchEnd(event: ResourceBatchEndEvent): void {
      closeBatch(event, true);
    },

    onBatchError(event: ResourceBatchErrorEvent): void {
      closeBatch(event, false);
    },
  };

  const snapshot = (): ResolutionRunMetrics => {
    const bySourceId = new Map<string, BatchInterval[]>();
    for (const batch of batches) {
      const list = bySourceId.get(batch.sourceId);
      if (list === undefined) {
        bySourceId.set(batch.sourceId, [batch]);
      } else {
        list.push(batch);
      }
    }

    const bySource: Record<string, SourceRunMetrics> = {};
    for (const [sourceId, sourceBatches] of bySourceId) {
      bySource[sourceId] = buildSourceMetrics(
        sourceId,
        sourceBatches,
        configuredBatchSizeBySource[sourceId]
      );
    }

    return {
      strategy,
      wallMs,
      resolvedCount,
      errorCount,
      promotedCount,
      batchCount: batches.length,
      batches: [...batches],
      bySource,
      maxInFlightBatches,
      overlapMs: computeOverlapMs(batches),
    };
  };

  return { observer, snapshot, reset };
}
