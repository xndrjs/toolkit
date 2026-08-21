import { domain, type KitInstance, zodFromKit, zodToValidator } from "@xndrjs/domain-zod";
import { z } from "zod";

import { TabShape } from "./tab.shape.js";

export const TabsShape = domain.shape(
  "Tabs",
  zodToValidator(
    z.object({
      type: z.literal("Tabs"),
      id: z.string().min(1),
      title: z.string().nullable(),
      tabs: z.array(zodFromKit(TabShape)),
    })
  )
);

export type Tabs = KitInstance<typeof TabsShape>;
