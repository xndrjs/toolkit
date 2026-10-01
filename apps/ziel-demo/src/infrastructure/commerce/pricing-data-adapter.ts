import type { ResourceLoadContext } from "@xndrjs/ziel";

import {
  offerPriceAri,
  type OfferPricePayload,
  type OfferPriceResource,
  type PricingApiContext,
} from "../../generated";
import { demoPrices } from "../fixtures/commerce-store.js";
import type { OfferPricePayloadWire } from "./schemas/offer-price.js";
import { parsePayload } from "../schemas/parse-payload.js";
import { mapWireToOfferPricePayload } from "./mappers/index.js";
import { offerPricePayloadSchema } from "./schemas/index.js";

export function loadOfferPrices(prices: ReadonlyMap<string, OfferPricePayloadWire> = demoPrices) {
  return async (
    batch: readonly OfferPriceResource[],
    _context: ResourceLoadContext<PricingApiContext>
  ): Promise<readonly (OfferPricePayload | undefined)[]> =>
    batch.map((resource) => {
      if (!offerPriceAri.matches(resource)) {
        return undefined;
      }
      const { id, market } = resource.key[0];
      const raw = prices.get(`${id}/${market}`);
      return raw === undefined
        ? undefined
        : mapWireToOfferPricePayload(parsePayload(offerPricePayloadSchema, raw, "OfferPrice"));
    });
}
