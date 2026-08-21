import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import type { ResourceKey } from "@xndrjs/resource-graph-resolver";

import type { DataResolutionAdapter } from "../data-resolution-adapter.js";
import { integrationProductAri } from "./ari.js";
import { demoProductCatalog, type ProductIntegrationSnapshot } from "./catalog.js";
import type { IntegrationContentRegistry } from "./content-registry.js";

/**
 * In-memory integration adapter that mimics a dedicated commercial API
 * (e.g. `POST /products/by-sku { skus: [...] }`) rather than one call per SKU.
 */
export function createIntegrationDataAdapter(
  catalog: ReadonlyMap<string, ProductIntegrationSnapshot> = demoProductCatalog
): DataResolutionAdapter<IntegrationContentRegistry> {
  return {
    async resolve(resources) {
      const skus: string[] = [];
      const productAris: ApplicationResourceIdentifier[] = [];

      for (const resource of resources) {
        if (!integrationProductAri.matches(resource)) {
          continue;
        }
        const sku = readSkuKey(resource);
        if (sku !== undefined) {
          skus.push(sku);
          productAris.push(resource);
        }
      }

      // Mimic one batched commercial lookup for the frontier's SKUs.
      const fetched = await mockProductsBySkus(catalog, skus);

      const result = new Map<
        ResourceKey,
        IntegrationContentRegistry[keyof IntegrationContentRegistry]
      >();
      for (const resource of productAris) {
        const sku = readSkuKey(resource)!;
        const snapshot = fetched.get(sku);
        if (snapshot) {
          result.set(resource.format(), snapshot);
        }
      }

      return result;
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

function readSkuKey(resource: ApplicationResourceIdentifier): string | undefined {
  const part = resource.key[0];
  if (typeof part === "object" && part !== null && "sku" in part && typeof part.sku === "string") {
    return part.sku;
  }
  return undefined;
}
