import type { ResourceLoadContext } from "@xndrjs/ziel";

import {
  stockLevelAri,
  type InventoryApiContext,
  type StockLevelPayload,
  type StockLevelResource,
} from "../../generated";
import { demoStock } from "../fixtures/commerce-store.js";

export function loadStockLevels(stock: ReadonlyMap<string, StockLevelPayload> = demoStock) {
  return async (
    batch: readonly StockLevelResource[],
    _context: ResourceLoadContext<InventoryApiContext>
  ): Promise<readonly (StockLevelPayload | undefined)[]> =>
    batch.map((resource) => {
      if (!stockLevelAri.matches(resource)) {
        return undefined;
      }
      const { sku, warehouse } = resource.key[0];
      return stock.get(`${sku}/${warehouse}`);
    });
}
