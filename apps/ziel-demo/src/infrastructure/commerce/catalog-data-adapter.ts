import type { ResourceLoadContext } from "@xndrjs/ziel";

import {
  catalogProductAri,
  type CatalogApiContext,
  type CatalogProductPayload,
  type CatalogProductResource,
} from "../../generated/resources";
import { demoCatalogProducts } from "../fixtures/commerce-store.js";
import type { CatalogProductPayloadWire } from "./schemas/catalog-product.js";
import { parsePayload } from "../schemas/parse-payload.js";
import { mapWireToCatalogProductPayload } from "./mappers/index.js";
import { catalogProductPayloadSchema } from "./schemas/index.js";

export function loadCatalogProducts(
  products: ReadonlyMap<string, CatalogProductPayloadWire> = demoCatalogProducts
) {
  return async (
    batch: readonly CatalogProductResource[],
    _context: ResourceLoadContext<CatalogApiContext>
  ): Promise<readonly (CatalogProductPayload | undefined)[]> =>
    batch.map((resource) => {
      if (!catalogProductAri.matches(resource)) {
        return undefined;
      }
      const { id, market, locale } = resource.key;
      const raw = products.get(`${id}/${market}/${locale}`);
      return raw === undefined
        ? undefined
        : mapWireToCatalogProductPayload(
            parsePayload(catalogProductPayloadSchema, raw, "CatalogProduct")
          );
    });
}
