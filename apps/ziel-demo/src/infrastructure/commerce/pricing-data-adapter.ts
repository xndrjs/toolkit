import type { ResourceLoadContext } from "@xndrjs/ziel";

import {
  offerPriceAri,
  type OfferPricePayload,
  type OfferPriceResource,
  type PricingApiContext,
} from "../../generated";
import { demoPrices } from "../fixtures/commerce-store.js";

export function loadOfferPrices(prices: ReadonlyMap<string, OfferPricePayload> = demoPrices) {
  return async (
    batch: readonly OfferPriceResource[],
    _context: ResourceLoadContext<PricingApiContext>
  ): Promise<readonly (OfferPricePayload | undefined)[]> =>
    batch.map((resource) => {
      if (!offerPriceAri.matches(resource)) {
        return undefined;
      }
      const { id, market } = resource.key[0];
      return prices.get(`${id}/${market}`);
    });
}
