import { domain, type KitInstance, zodFromKit, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

import { FooterShape } from "./footer.shape.js";
import { HeroShape, type Hero } from "./hero.shape.js";
import { MenuShape } from "./menu.shape.js";
import { ProductShape, type Product } from "./product.shape.js";
import { TabsShape, type Tabs } from "./tabs.shape.js";

/** Polymorphic page module: Tabs container, Hero, or aggregated Product. */
export const PageModuleSchema = z.union([
  zodFromKit(TabsShape),
  zodFromKit(HeroShape),
  zodFromKit(ProductShape),
]);

/** Discriminated by `type`: `"Tabs" | "Hero" | "Product"`. */
export type PageModule = Tabs | Hero | Product;

export const PageShape = domain.shape(
  "Page",
  zodToValidator(
    z.object({
      type: z.literal("Page"),
      id: z.string().min(1),
      title: z.string().min(1),
      modules: z.array(PageModuleSchema),
      menu: zodFromKit(MenuShape).nullable(),
      footer: zodFromKit(FooterShape).nullable(),
    })
  )
);

export type Page = KitInstance<typeof PageShape>;
