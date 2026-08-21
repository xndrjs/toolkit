import { domain, type KitInstance, zodFromKit, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

import { AssetShape } from "./asset.shape.js";

export const HeroShape = domain.shape(
  "Hero",
  zodToValidator(
    z.object({
      type: z.literal("Hero"),
      id: z.string().min(1),
      title: z.string().nullable(),
      image: zodFromKit(AssetShape),
    })
  )
);

export type Hero = KitInstance<typeof HeroShape>;
