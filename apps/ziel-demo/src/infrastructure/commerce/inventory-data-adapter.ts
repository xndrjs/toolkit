import type { ResourceLoadContext } from "@xndrjs/ziel";

import {
  stockLevelAri,
  type InventoryApiContext,
  type StockLevelPayload,
  type StockLevelResource,
} from "../../generated/resources";
import { demoStock } from "../fixtures/commerce-store.js";
import type { StockLevelPayloadWire } from "./schemas/stock-level.js";
import { parsePayload } from "../schemas/parse-payload.js";
import { mapWireToStockLevelPayload } from "./mappers/index.js";
import { stockLevelPayloadSchema } from "./schemas/index.js";

export function loadStockLevels(stock: ReadonlyMap<string, StockLevelPayloadWire> = demoStock) {
  return async (
    batch: readonly StockLevelResource[],
    _context: ResourceLoadContext<InventoryApiContext>
  ): Promise<readonly (StockLevelPayload | undefined)[]> =>
    batch.map((resource) => {
      if (!stockLevelAri.matches(resource)) {
        return undefined;
      }
      const { sku, warehouse } = resource.key;
      const raw = stock.get(`${sku}/${warehouse}`);
      return raw === undefined
        ? undefined
        : mapWireToStockLevelPayload(parsePayload(stockLevelPayloadSchema, raw, "StockLevel"));
    });
}
