import { domain, type KitInstance } from "@xndrjs/domain-zod";
import { z } from "zod";

/** ISO 4217 currency codes used by the demo integration. */
export const CurrencyPrimitive = domain.primitive("Currency", z.enum(["EUR", "USD", "GBP"]));

export type Currency = KitInstance<typeof CurrencyPrimitive>;
