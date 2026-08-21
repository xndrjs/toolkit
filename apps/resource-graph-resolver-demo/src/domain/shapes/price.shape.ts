import { domain, type KitInstance, zodFromKit, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

import { CurrencyPrimitive } from "../primitives/currency.primitive.js";
import { MoneyCentsPrimitive } from "../primitives/money-cents.primitive.js";

/** Integration money amount: cents + currency. */
export const PriceShape = domain.shape(
  "Price",
  zodToValidator(
    z.object({
      type: z.literal("Price"),
      amount: zodFromKit(MoneyCentsPrimitive),
      currency: zodFromKit(CurrencyPrimitive),
    })
  )
);

export type Price = KitInstance<typeof PriceShape>;
