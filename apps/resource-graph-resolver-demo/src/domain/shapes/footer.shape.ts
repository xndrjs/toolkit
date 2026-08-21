import { domain, type KitInstance, zodFromKit, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

import { AssetShape } from "./asset.shape.js";

export const FooterShape = domain.shape(
  "Footer",
  zodToValidator(
    z.object({
      type: z.literal("Footer"),
      id: z.string().min(1),
      title: z.string().nullable(),
      logo: zodFromKit(AssetShape),
    })
  )
);

export type Footer = KitInstance<typeof FooterShape>;
