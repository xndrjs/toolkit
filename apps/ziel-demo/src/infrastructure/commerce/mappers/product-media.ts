import { Scalars, type ProductMediaPayload } from "../../../generated";
import type { ProductMediaPayloadWire } from "../schemas/product-media.js";

/** Map validated wire shape → Ziel `ProductMediaPayload` (branded scalars). */
export function mapWireToProductMediaPayload(wire: ProductMediaPayloadWire): ProductMediaPayload {
  return {
    id: Scalars.MediaId(wire.id),
    url: wire.url,
    alt: wire.alt,
  };
}
