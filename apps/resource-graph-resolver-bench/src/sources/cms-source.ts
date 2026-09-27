import { defineDataSourceFor, type DataSource } from "@xndrjs/resource-graph-resolver";

import { benchNodeAri, type BenchNodeResource } from "../graph/ari";
import type { BenchContentRegistry, BenchNodePayload } from "../graph/generate";
import { simulateNetworkLatency } from "./simulate-latency";

export const CMS_SOURCE_ID = "cms";

export type CmsSourceOptions = {
  /** Max `bench.node` ARIs per load. */
  readonly batchSize: number;
  /** Simulated network RTT (ms) applied once per load. Default 0. */
  readonly latencyMs?: number;
  /** Loads this source tolerates in parallel. Default 1. */
  readonly concurrency?: number;
};

const defineCmsSource = defineDataSourceFor<BenchContentRegistry>();

/**
 * CMS source: owns `bench.node`.
 *
 * Latency is one sleep at the start of each `load` (batch RTT), not per item,
 * so scheduler batching dominates wall clock the way a real Delivery API would.
 */
export function createCmsSource(
  store: ReadonlyMap<string, BenchNodePayload>,
  options: CmsSourceOptions
): DataSource<BenchContentRegistry> {
  const latencyMs = options.latencyMs ?? 0;

  return defineCmsSource({
    id: CMS_SOURCE_ID,
    for: [benchNodeAri],
    batchSize: options.batchSize,
    concurrency: options.concurrency,
    load: (batch) => loadCmsNodes(store, batch, latencyMs),
  });
}

/**
 * Simulates a batched CMS id-in fetch.
 * Returns one slot per input ARI (same order); `undefined` = miss.
 */
export async function loadCmsNodes(
  store: ReadonlyMap<string, BenchNodePayload>,
  resources: readonly BenchNodeResource[],
  latencyMs = 0
): Promise<readonly (BenchNodePayload | undefined)[]> {
  if (resources.length === 0) {
    return [];
  }

  await simulateNetworkLatency(latencyMs);

  return resources.map((resource) => store.get(resource.key[0].id));
}
