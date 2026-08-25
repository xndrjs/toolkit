import { defineResourceSourceFor, type ResourceSource } from "@xndrjs/resource-graph-resolver";

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

export type CmsNodeRecord = {
  resource: BenchNodeResource;
  payload: BenchNodePayload;
};

const defineCmsSource = defineResourceSourceFor<BenchContentRegistry>();

/**
 * CMS source: owns `bench.node`.
 *
 * Latency is one sleep at the start of each `load` (batch RTT), not per item,
 * so scheduler batching dominates wall clock the way a real Delivery API would.
 */
export function createCmsSource(
  store: ReadonlyMap<string, BenchNodePayload>,
  options: CmsSourceOptions
): ResourceSource<BenchContentRegistry> {
  const latencyMs = options.latencyMs ?? 0;

  return defineCmsSource({
    id: CMS_SOURCE_ID,
    families: { node: benchNodeAri },
    batchSize: { node: options.batchSize },
    concurrency: options.concurrency,
    load: ({ node }) => loadCmsNodes(store, node, latencyMs),
  });
}

/** Simulates a batched CMS id-in fetch and correlates rows back to ARIs. */
export async function loadCmsNodes(
  store: ReadonlyMap<string, BenchNodePayload>,
  resources: readonly BenchNodeResource[],
  latencyMs = 0
): Promise<CmsNodeRecord[]> {
  if (resources.length === 0) {
    return [];
  }

  await simulateNetworkLatency(latencyMs);

  const records: CmsNodeRecord[] = [];
  for (const resource of resources) {
    const payload = store.get(resource.key[0].id);
    if (payload !== undefined) {
      records.push({ resource, payload });
    }
  }

  return records;
}
