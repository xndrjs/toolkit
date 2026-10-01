import { Scalars, type OfferPricePayload } from "../../../generated";
import type { OfferPricePayloadWire } from "../schemas/offer-price.js";

/** Map validated wire shape → Ziel `OfferPricePayload` (branded scalars). */
export function mapWireToOfferPricePayload(wire: OfferPricePayloadWire): OfferPricePayload {
  return {
    id: Scalars.PriceId(wire.id),
    amountCents: wire.amountCents,
    currency: wire.currency,
  };
}
