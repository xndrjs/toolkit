/**
 * Handwritten graph walks for comparing against `createResourceGraphResolver`.
 *
 * - `naive`: one RTT per resource (no batching).
 * - `batched`: DataLoader-style — flush pending ARIs per family in chunks of
 *   `batchSize` (still a level-by-level BFS over the expansion graph).
 */
import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import {
  benchNodeAri,
  benchProductAri,
  type BenchNodeResource,
  type BenchProductResource,
} from "../graph/ari";
import type { GeneratedBenchGraph } from "../graph/generate";
import type { BatchInterval, ResolutionRunMetrics, SourceRunMetrics } from "../metrics/collect";
import { computeOverlapMs } from "../metrics/collect";
import { distributionOf, fillHistogram } from "../metrics/summarize";
import type { BenchCaseConfig, OrchestrationMode } from "../runner/types";
import { CMS_SOURCE_ID, loadCmsNodes } from "../sources/cms-source";
import { INTEGRATION_SOURCE_ID, loadIntegrationProducts } from "../sources/integration-source";

export type { OrchestrationMode };

function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) {
    return [items.slice()];
  }
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function resourceKey(resource: ApplicationResourceIdentifier): string {
  return resource.toString();
}

type ExpandResult = {
  readonly children: readonly ApplicationResourceIdentifier[];
};

function expandNode(
  resource: ApplicationResourceIdentifier,
  graph: GeneratedBenchGraph
): ExpandResult {
  if (benchNodeAri.matches(resource)) {
    const payload = graph.cmsStore.get(resource.key[0].id);
    if (payload === undefined) {
      return { children: [] };
    }
    if (payload.children.length > 0) {
      return {
        children: payload.children.map((id) => benchNodeAri({ id })),
      };
    }
    return { children: [benchProductAri({ sku: resource.key[0].id })] };
  }
  return { children: [] };
}

async function recordBatch(
  batches: BatchInterval[],
  sourceId: string,
  batchNumber: number,
  resourceCount: number,
  resourcesByType: Readonly<Record<string, number>>,
  work: () => Promise<void>
): Promise<void> {
  const startedAt = performance.now();
  await work();
  const endedAt = performance.now();
  batches.push({
    sourceId,
    batchNumber,
    startedAt,
    endedAt,
    resourceCount,
    durationMs: endedAt - startedAt,
    ok: true,
    resourcesByType,
  });
}

function metricsFromBatches(
  batches: readonly BatchInterval[],
  wallMs: number,
  resolvedCount: number,
  schedulingMode: string,
  config: BenchCaseConfig
): ResolutionRunMetrics {
  const bySourceId = new Map<string, BatchInterval[]>();
  for (const batch of batches) {
    const list = bySourceId.get(batch.sourceId);
    if (list === undefined) {
      bySourceId.set(batch.sourceId, [batch]);
    } else {
      list.push(batch);
    }
  }

  const configured: Record<string, number> = {
    [CMS_SOURCE_ID]: config.cmsBatchSize,
    [INTEGRATION_SOURCE_ID]: config.integrationBatchSize,
  };

  const bySource: Record<string, SourceRunMetrics> = {};
  for (const [sourceId, sourceBatches] of bySourceId) {
    const effectiveBatchSizes = sourceBatches.map((b) => b.resourceCount);
    const batchDurationMs = sourceBatches.map((b) => b.durationMs);
    let sumBatchDurationMs = 0;
    let maxBatchDurationMs = 0;
    for (const duration of batchDurationMs) {
      sumBatchDurationMs += duration;
      if (duration > maxBatchDurationMs) {
        maxBatchDurationMs = duration;
      }
    }
    bySource[sourceId] = {
      sourceId,
      batchCount: sourceBatches.length,
      effectiveBatchSizes,
      batchDurationMs,
      sumBatchDurationMs,
      maxBatchDurationMs,
      effectiveBatchSize: distributionOf(effectiveBatchSizes),
      fillHistogram: fillHistogram(effectiveBatchSizes, configured[sourceId]),
    };
  }

  return {
    schedulingMode,
    wallMs,
    resolvedCount,
    errorCount: 0,
    promotedCount: 0,
    batchCount: batches.length,
    batches: [...batches],
    bySource,
    // Handwritten walks are sequential; no overlapping batches.
    maxInFlightBatches: batches.length > 0 ? 1 : 0,
    overlapMs: computeOverlapMs(batches),
  };
}

/**
 * Naive walk: BFS, one load per ARI (batch size 1) — worst-case RTT count.
 */
export async function walkNaive(
  graph: GeneratedBenchGraph,
  config: BenchCaseConfig
): Promise<ResolutionRunMetrics> {
  const wallStart = performance.now();
  const batches: BatchInterval[] = [];
  const seen = new Set<string>();
  const queue: ApplicationResourceIdentifier[] = [graph.root];
  let cmsBatchNumber = 0;
  let integrationBatchNumber = 0;
  let resolvedCount = 0;

  while (queue.length > 0) {
    const resource = queue.shift()!;
    const key = resourceKey(resource);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    if (benchNodeAri.matches(resource)) {
      const node = resource as BenchNodeResource;
      cmsBatchNumber += 1;
      await recordBatch(
        batches,
        CMS_SOURCE_ID,
        cmsBatchNumber,
        1,
        { "bench.node": 1 },
        async () => {
          await loadCmsNodes(graph.cmsStore, [node], config.cmsLatencyMs);
        }
      );
      resolvedCount += 1;
      for (const child of expandNode(node, graph).children) {
        queue.push(child);
      }
      continue;
    }

    if (benchProductAri.matches(resource)) {
      const product = resource as BenchProductResource;
      integrationBatchNumber += 1;
      await recordBatch(
        batches,
        INTEGRATION_SOURCE_ID,
        integrationBatchNumber,
        1,
        { "bench.product": 1 },
        async () => {
          await loadIntegrationProducts(
            graph.productCatalog,
            [product],
            config.integrationLatencyMs
          );
        }
      );
      resolvedCount += 1;
    }
  }

  return metricsFromBatches(batches, performance.now() - wallStart, resolvedCount, "naive", config);
}

/**
 * Batched walk: BFS frontier flush — all pending CMS nodes then products,
 * chunked by configured batch sizes (DataLoader-like batching without lane overlap).
 */
export async function walkBatched(
  graph: GeneratedBenchGraph,
  config: BenchCaseConfig
): Promise<ResolutionRunMetrics> {
  const wallStart = performance.now();
  const batches: BatchInterval[] = [];
  const seen = new Set<string>();
  let frontier: ApplicationResourceIdentifier[] = [graph.root];
  let cmsBatchNumber = 0;
  let integrationBatchNumber = 0;
  let resolvedCount = 0;

  while (frontier.length > 0) {
    const nodes: BenchNodeResource[] = [];
    const products: BenchProductResource[] = [];
    for (const resource of frontier) {
      if (seen.has(resourceKey(resource))) {
        continue;
      }
      if (benchNodeAri.matches(resource)) {
        nodes.push(resource as BenchNodeResource);
      } else if (benchProductAri.matches(resource)) {
        products.push(resource as BenchProductResource);
      }
    }
    frontier = [];

    for (const chunkNodes of chunk(nodes, config.cmsBatchSize)) {
      if (chunkNodes.length === 0) {
        continue;
      }
      for (const resource of chunkNodes) {
        seen.add(resourceKey(resource));
      }
      cmsBatchNumber += 1;
      await recordBatch(
        batches,
        CMS_SOURCE_ID,
        cmsBatchNumber,
        chunkNodes.length,
        { "bench.node": chunkNodes.length },
        async () => {
          await loadCmsNodes(graph.cmsStore, chunkNodes, config.cmsLatencyMs);
        }
      );
      resolvedCount += chunkNodes.length;
      for (const resource of chunkNodes) {
        for (const child of expandNode(resource, graph).children) {
          if (!seen.has(resourceKey(child))) {
            frontier.push(child);
          }
        }
      }
    }

    for (const chunkProducts of chunk(products, config.integrationBatchSize)) {
      if (chunkProducts.length === 0) {
        continue;
      }
      for (const resource of chunkProducts) {
        seen.add(resourceKey(resource));
      }
      integrationBatchNumber += 1;
      await recordBatch(
        batches,
        INTEGRATION_SOURCE_ID,
        integrationBatchNumber,
        chunkProducts.length,
        { "bench.product": chunkProducts.length },
        async () => {
          await loadIntegrationProducts(
            graph.productCatalog,
            chunkProducts,
            config.integrationLatencyMs
          );
        }
      );
      resolvedCount += chunkProducts.length;
    }
  }

  return metricsFromBatches(
    batches,
    performance.now() - wallStart,
    resolvedCount,
    "batched",
    config
  );
}
