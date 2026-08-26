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

export type IntegrationProductRecord = {
  resource: BenchProductResource;
  payload: BenchProductPayload;
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
    families: { product: benchProductAri },
    batchSize: { product: options.batchSize },
    concurrency: options.concurrency,
    load: ({ product }) => loadIntegrationProducts(catalog, product, latencyMs),
  });
}

/** Simulates a batched products-by-sku fetch and correlates rows back to ARIs. */
export async function loadIntegrationProducts(
  catalog: ReadonlyMap<string, BenchProductPayload>,
  resources: readonly BenchProductResource[],
  latencyMs = 0
): Promise<IntegrationProductRecord[]> {
  if (resources.length === 0) {
    return [];
  }

  await simulateNetworkLatency(latencyMs);

  const records: IntegrationProductRecord[] = [];
  for (const resource of resources) {
    const payload = catalog.get(resource.key[0].sku);
    if (payload !== undefined) {
      records.push({ resource, payload });
    }
  }

  return records;
}
