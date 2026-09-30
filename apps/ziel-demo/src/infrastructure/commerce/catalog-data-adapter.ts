import type { ResourceLoadContext } from "@xndrjs/ziel";

import {
  catalogProductAri,
  type CatalogApiContext,
  type CatalogProductPayload,
  type CatalogProductResource,
} from "../../generated";
import { demoCatalogProducts } from "../fixtures/commerce-store.js";

export function loadCatalogProducts(
  products: ReadonlyMap<string, CatalogProductPayload> = demoCatalogProducts
) {
  return async (
    batch: readonly CatalogProductResource[],
    _context: ResourceLoadContext<CatalogApiContext>
  ): Promise<readonly (CatalogProductPayload | undefined)[]> =>
    batch.map((resource) => {
      if (!catalogProductAri.matches(resource)) {
        return undefined;
      }
      const { id, market, locale } = resource.key[0];
      return products.get(`${id}/${market}/${locale}`);
    });
}
