import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import type { DataResolutionPull, ResolvedResourceRecord } from "@xndrjs/resource-graph-resolver";

import { simulateNetworkLatency } from "../simulate-latency.js";
import { integrationProductAri, type IntegrationProductResource } from "./ari.js";
import { demoProductCatalog, type ProductIntegrationSnapshot } from "./catalog.js";
import type { IntegrationContentRegistry } from "./content-registry.js";

export const INTEGRATION_BATCH_SIZE = 1;

export type IntegrationDataLoaderOptions = {
  /** Simulated network latency (ms) applied to each products-by-sku fetch. Default 0. */
  latencyMs?: number;
};

/** Ownership predicate for integration ARIs (`integration.product`). */
export function acceptsIntegrationResource(resource: ApplicationResourceIdentifier): boolean {
  return integrationProductAri.matches(resource);
}

/**
 * Integration batch loader — not a DataResolutionPort.
 * Mimics a dedicated commercial API (`POST /products/by-sku { skus: [...] }`).
 * Locale is part of the ARI key; the demo catalog is still keyed by SKU only.
 * `accepts` supports {@link import("@xndrjs/resource-graph-resolver").ResourceLoader} routing.
 */
export type IntegrationDataLoader = {
  accepts(resource: ApplicationResourceIdentifier): boolean;
  load(
    resources: readonly IntegrationProductResource[]
  ): Promise<readonly ResolvedResourceRecord<IntegrationContentRegistry>[]>;
  process(
    pull: DataResolutionPull
  ): Promise<readonly ResolvedResourceRecord<IntegrationContentRegistry>[]>;
};

export function createIntegrationDataLoader(
  catalog: ReadonlyMap<string, ProductIntegrationSnapshot> = demoProductCatalog,
  options?: IntegrationDataLoaderOptions
): IntegrationDataLoader {
  const latencyMs = options?.latencyMs ?? 0;

  return {
    accepts: acceptsIntegrationResource,

    async load(resources) {
      const skus: string[] = [];
      const productAris: IntegrationProductResource[] = [];

      for (const resource of resources) {
        if (!integrationProductAri.matches(resource)) {
          continue;
        }
        skus.push(resource.key[0].sku);
        productAris.push(resource);
      }

      const fetched = await mockProductsBySkus(catalog, skus, latencyMs);

      const result: ResolvedResourceRecord<IntegrationContentRegistry>[] = [];
      for (const resource of productAris) {
        const snapshot = fetched.get(resource.key[0].sku);
        if (snapshot) {
          result.push({ resource, payload: snapshot });
        }
      }

      return result;
    },

    async process(pull) {
      const batch = pull.take(integrationProductAri.matches, INTEGRATION_BATCH_SIZE);
      if (batch.length === 0) {
        return [];
      }
      return this.load(batch);
    },
  };
}

/** Simulates `POST /products/by-sku` against an in-memory catalog. */
async function mockProductsBySkus(
  catalog: ReadonlyMap<string, ProductIntegrationSnapshot>,
  skus: readonly string[],
  latencyMs: number
): Promise<Map<string, ProductIntegrationSnapshot>> {
  await simulateNetworkLatency(latencyMs);
  const unique = [...new Set(skus)];
  const found = new Map<string, ProductIntegrationSnapshot>();
  for (const sku of unique) {
    const snapshot = catalog.get(sku);
    if (snapshot) {
      found.set(sku, snapshot);
    }
  }
  return found;
}
