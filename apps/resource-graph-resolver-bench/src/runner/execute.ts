import {
  createResourceGraphResolver,
  type ResolutionStrategy,
} from "@xndrjs/resource-graph-resolver";

import { createBenchExpansionPort } from "../graph/expansion";
import { generateBenchGraph, type GeneratedBenchGraph } from "../graph/generate";
import { generatePagebuilderGraph } from "../graph/pagebuilder";
import { createMetricsCollector, type ResolutionRunMetrics } from "../metrics/collect";
import { summarizeRuns } from "../metrics/summarize";
import { createCmsSource, CMS_SOURCE_ID } from "../sources/cms-source";
import { createIntegrationSource, INTEGRATION_SOURCE_ID } from "../sources/integration-source";
import type { BenchCaseConfig, BenchCaseResult } from "./types";

function generateGraphForCase(config: BenchCaseConfig): GeneratedBenchGraph {
  if (config.profile === "pagebuilder") {
    return generatePagebuilderGraph({
      modules: config.modules,
      depth: config.depth,
      arity: config.arity,
      productStride: config.productStride,
      maxNodes: config.maxNodes,
    });
  }

  return generateBenchGraph({
    depth: config.depth,
    arity: config.arity,
    maxNodes: config.maxNodes,
  });
}

async function resolveOnce(
  graph: GeneratedBenchGraph,
  config: BenchCaseConfig
): Promise<ResolutionRunMetrics> {
  const collector = createMetricsCollector({
    configuredBatchSizeBySource: {
      [CMS_SOURCE_ID]: config.cmsBatchSize,
      [INTEGRATION_SOURCE_ID]: config.integrationBatchSize,
    },
  });

  const resolver = createResourceGraphResolver({
    sources: [
      createCmsSource(graph.cmsStore, {
        batchSize: config.cmsBatchSize,
        latencyMs: config.cmsLatencyMs,
        concurrency: config.cmsConcurrency,
      }),
      createIntegrationSource(graph.productCatalog, {
        batchSize: config.integrationBatchSize,
        latencyMs: config.integrationLatencyMs,
        concurrency: config.integrationConcurrency,
      }),
    ],
    expansion: createBenchExpansionPort(),
    strategy: config.strategy,
    observer: collector.observer,
  });

  await resolver.resolve({
    root: graph.root,
    executionContext: {},
    missingResourceMode: "throw",
  });

  return collector.snapshot();
}

/**
 * Runs one matrix cell: generate graph once, warmup resolves (discarded), then
 * measured repeats → summarized metrics.
 */
export async function executeBenchCase(config: BenchCaseConfig): Promise<BenchCaseResult> {
  const graph = generateGraphForCase(config);

  for (let i = 0; i < config.warmup; i += 1) {
    await resolveOnce(graph, config);
  }

  const repeats: ResolutionRunMetrics[] = [];
  for (let i = 0; i < config.repeats; i += 1) {
    repeats.push(await resolveOnce(graph, config));
  }

  return {
    config,
    graph: graph.counts,
    summary: summarizeRuns(repeats),
    repeats,
  };
}

/** Stable label for logging / `--list` (excludes warmup/repeats/maxNodes). */
export function formatCaseLabel(config: {
  readonly profile: string;
  readonly depth: number;
  readonly arity: number;
  readonly modules: number;
  readonly productStride: number;
  readonly strategy: ResolutionStrategy;
  readonly cmsBatchSize: number;
  readonly integrationBatchSize: number;
  readonly cmsLatencyMs: number;
  readonly integrationLatencyMs: number;
  readonly cmsConcurrency: number;
  readonly integrationConcurrency: number;
}): string {
  const shape =
    config.profile === "pagebuilder"
      ? `profile=pagebuilder modules=${config.modules} depth=${config.depth} arity=${config.arity} stride=${config.productStride}`
      : `profile=tree depth=${config.depth} arity=${config.arity}`;

  return [
    shape,
    `strategy=${config.strategy}`,
    `cmsBatch=${config.cmsBatchSize}`,
    `intBatch=${config.integrationBatchSize}`,
    `cmsLat=${config.cmsLatencyMs}ms`,
    `intLat=${config.integrationLatencyMs}ms`,
    `cmsConc=${config.cmsConcurrency}`,
    `intConc=${config.integrationConcurrency}`,
  ].join(" ");
}
