import { domain, type KitInstance, zodFromKit, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

import { AssetShape } from "./asset.shape.js";

export const MenuShape = domain.shape(
  "Menu",
  zodToValidator(
    z.object({
      type: z.literal("Menu"),
      id: z.string().min(1),
      title: z.string().nullable(),
      logo: zodFromKit(AssetShape),
    })
  )
);

export type Menu = KitInstance<typeof MenuShape>;
