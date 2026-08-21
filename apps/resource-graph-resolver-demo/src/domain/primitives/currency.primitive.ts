import { domain, type KitInstance, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

/** ISO 4217 currency codes used by the demo integration. */
export const CurrencyPrimitive = domain.primitive(
  "Currency",
  zodToValidator(z.enum(["EUR", "USD", "GBP"]))
);

export type Currency = KitInstance<typeof CurrencyPrimitive>;
