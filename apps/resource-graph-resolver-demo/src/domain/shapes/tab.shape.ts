import { domain, type KitInstance, zodFromKit, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

import { HeroShape, type Hero } from "./hero.shape.js";
import { ProductShape, type Product } from "./product.shape.js";

/** Polymorphic tab strip: hydrated Hero or aggregated Product. */
export const TabStripSchema = z.union([zodFromKit(HeroShape), zodFromKit(ProductShape)]);

/** Discriminated by `type`: `"Hero" | "Product"`. */
export type TabStrip = Hero | Product;

export const TabShape = domain.shape(
  "Tab",
  zodToValidator(
    z.object({
      type: z.literal("Tab"),
      id: z.string().min(1),
      title: z.string().min(1),
      strips: z.array(TabStripSchema),
    })
  )
);

export type Tab = KitInstance<typeof TabShape>;
