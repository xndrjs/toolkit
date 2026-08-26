import { defineDataSourceFor, type DataSource } from "@xndrjs/resource-graph-resolver";

import type { DemoContentRegistry } from "../content-registry.js";
import type { DemoExecutionContext } from "../demo-execution-context.js";
import { simulateNetworkLatency } from "../simulate-latency.js";
import { integrationProductAri, type IntegrationProductResource } from "./ari.js";
import { demoProductCatalog, type ProductIntegrationSnapshot } from "./catalog.js";

/** The commercial API accepts one SKU per call, which is what makes it the slow lane. */
export const INTEGRATION_BATCH_SIZE = 1;

export const INTEGRATION_SOURCE_ID = "integration";

export type IntegrationSourceOptions = {
  /** Simulated network latency (ms) applied to each products-by-sku fetch. Default 0. */
  latencyMs?: number;
  /** Requests this API tolerates in parallel. Default 1 (serial). */
  concurrency?: number;
};

export type IntegrationProductRecord = {
  resource: IntegrationProductResource;
  payload: ProductIntegrationSnapshot;
};

const defineIntegrationSource = defineDataSourceFor<DemoContentRegistry, DemoExecutionContext>();

/**
 * Integration source: owns `integration.product`.
 *
 * Mimics a dedicated commercial API (`POST /products/by-sku { skus: [...] }`).
 * Locale is part of the ARI key; the demo catalog is still keyed by SKU only.
 */
export function createIntegrationSource(
  catalog: ReadonlyMap<string, ProductIntegrationSnapshot> = demoProductCatalog,
  options?: IntegrationSourceOptions
): DataSource<DemoContentRegistry, DemoExecutionContext> {
  const latencyMs = options?.latencyMs ?? 0;

  return defineIntegrationSource({
    id: INTEGRATION_SOURCE_ID,
    families: { product: integrationProductAri },
    batchSize: { product: INTEGRATION_BATCH_SIZE },
    ...(options?.concurrency !== undefined ? { concurrency: options.concurrency } : {}),

    load: ({ product }) => loadIntegrationProducts(catalog, product, latencyMs),
  });
}

/** Simulates `POST /products/by-sku` and correlates snapshots back to ARIs. */
export async function loadIntegrationProducts(
  catalog: ReadonlyMap<string, ProductIntegrationSnapshot>,
  resources: readonly IntegrationProductResource[],
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
