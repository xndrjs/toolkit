import { Scalars, type CatalogProductPayload } from "../../../generated";
import type { CatalogProductPayloadWire } from "../schemas/catalog-product.js";

/** Map validated wire shape → Ziel `CatalogProductPayload` (branded scalars). */
export function mapWireToCatalogProductPayload(
  wire: CatalogProductPayloadWire
): CatalogProductPayload {
  return {
    id: Scalars.CatalogProductId(wire.id),
    title: wire.title,
    priceId: Scalars.PriceId(wire.priceId),
    sku: Scalars.InventorySku(wire.sku),
    mediaId: Scalars.MediaId(wire.mediaId),
  };
}
