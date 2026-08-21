import { domain, type KitInstance, zodFromKit, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

import { PriceShape } from "./price.shape.js";

/**
 * Aggregated product: CMS editorial fields plus integration `price` / `availability`.
 * Price and stock are not part of the Contentful content type.
 */
export const ProductShape = domain.shape(
  "Product",
  zodToValidator(
    z.object({
      type: z.literal("Product"),
      id: z.string().min(1),
      sku: z.string().min(1),
      title: z.string().min(1),
      description: z.string().nullable(),
      price: zodFromKit(PriceShape),
      /** `true` when the integration reports the SKU in stock. */
      availability: z.boolean(),
    })
  )
);

export type Product = KitInstance<typeof ProductShape>;
