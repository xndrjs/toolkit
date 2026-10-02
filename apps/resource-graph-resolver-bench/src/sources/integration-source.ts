import { defineDataSourceFor, type DataSource } from "@xndrjs/resource-graph-resolver";

import { benchProductAri, type BenchProductResource } from "../graph/ari";
import type { BenchContentRegistry, BenchProductPayload } from "../graph/generate";
import { simulateNetworkLatency } from "./simulate-latency";

export const INTEGRATION_SOURCE_ID = "integration";

export type IntegrationSourceOptions = {
  /** Max `bench.product` ARIs per load. */
  readonly batchSize: number;
  /** Simulated network RTT (ms) applied once per load. Default 0. */
  readonly latencyMs?: number;
  /** Loads this source tolerates in parallel. Default 1. */
  readonly concurrency?: number;
};

const defineIntegrationSource = defineDataSourceFor<BenchContentRegistry>();

/**
 * Integration source: owns `bench.product`.
 *
 * One sleep per load (batch RTT). Default matrix uses higher latency than CMS so
 * lane scheduling can overlap CMS work with the slower product lane.
 */
export function createIntegrationSource(
  catalog: ReadonlyMap<string, BenchProductPayload>,
  options: IntegrationSourceOptions
): DataSource<BenchContentRegistry> {
  const latencyMs = options.latencyMs ?? 0;

  return defineIntegrationSource({
    id: INTEGRATION_SOURCE_ID,
    for: [benchProductAri],
    batchSize: options.batchSize,
    concurrency: options.concurrency,
    load: (batch) => loadIntegrationProducts(catalog, batch, latencyMs),
  });
}

/**
 * Simulates a batched products-by-sku fetch.
 * Returns one slot per input ARI (same order); `undefined` = miss.
 */
export async function loadIntegrationProducts(
  catalog: ReadonlyMap<string, BenchProductPayload>,
  resources: readonly BenchProductResource[],
  latencyMs = 0
): Promise<readonly (BenchProductPayload | undefined)[]> {
  if (resources.length === 0) {
    return [];
  }

  await simulateNetworkLatency(latencyMs);

  return resources.map((resource) => catalog.get(resource.key.sku));
}
