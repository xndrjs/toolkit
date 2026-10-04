import { Scalars, type StockLevelPayload } from "../../../generated/resources";
import type { StockLevelPayloadWire } from "../schemas/stock-level.js";

/** Map validated wire shape → Ziel `StockLevelPayload` (branded scalars). */
export function mapWireToStockLevelPayload(wire: StockLevelPayloadWire): StockLevelPayload {
  return {
    sku: Scalars.InventorySku(wire.sku),
    available: wire.available,
  };
}
