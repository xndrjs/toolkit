import type { ResourceLoadContext } from "@xndrjs/ziel";

import {
  stockLevelAri,
  type InventoryApiContext,
  type StockLevelPayload,
  type StockLevelResource,
} from "../../generated";
import { demoStock } from "../fixtures/commerce-store.js";
import { parsePayload } from "../schemas/parse-payload.js";
import { mapWireToStockLevelPayload } from "./mappers/index.js";
import { stockLevelPayloadSchema } from "./schemas/index.js";

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
      const raw = stock.get(`${sku}/${warehouse}`);
      return raw === undefined
        ? undefined
        : mapWireToStockLevelPayload(parsePayload(stockLevelPayloadSchema, raw, "StockLevel"));
    });
}
