import { domain, type KitInstance } from "@xndrjs/domain-zod";
import { z } from "zod";

/** Integer cents — amount half of `PriceShape`. */
export const MoneyCentsPrimitive = domain.primitive("MoneyCents", z.number().int().nonnegative());

export type MoneyCents = KitInstance<typeof MoneyCentsPrimitive>;
