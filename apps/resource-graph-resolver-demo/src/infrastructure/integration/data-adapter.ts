import type { DataResolutionPull, ResolvedResourceRecord } from "@xndrjs/resource-graph-resolver";

import { integrationProductAri, type IntegrationProductResource } from "./ari.js";
import { demoProductCatalog, type ProductIntegrationSnapshot } from "./catalog.js";
import type { IntegrationContentRegistry } from "./content-registry.js";

export const INTEGRATION_BATCH_SIZE = 1;

/**
 * Integration batch loader — not a DataResolutionPort.
 * Mimics a dedicated commercial API (`POST /products/by-sku { skus: [...] }`).
 * Locale is part of the ARI key; the demo catalog is still keyed by SKU only.
 */
export type IntegrationDataLoader = {
  load(
    resources: readonly IntegrationProductResource[]
  ): Promise<readonly ResolvedResourceRecord<IntegrationContentRegistry>[]>;
  process(
    pull: DataResolutionPull
  ): Promise<readonly ResolvedResourceRecord<IntegrationContentRegistry>[]>;
};

export function createIntegrationDataLoader(
  catalog: ReadonlyMap<string, ProductIntegrationSnapshot> = demoProductCatalog
): IntegrationDataLoader {
  return {
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

      const fetched = await mockProductsBySkus(catalog, skus);

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
  skus: readonly string[]
): Promise<Map<string, ProductIntegrationSnapshot>> {
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
