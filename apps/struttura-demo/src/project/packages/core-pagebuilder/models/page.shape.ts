import { domain } from "@xndrjs/domain-zod";
import { z } from "zod";

export const PageShape = domain.shape(
  "Page",
  z.object({
    kind: z.literal("Page").default("Page"),
    // TODO: define shape fields
  }),
);

export type Page = ReturnType<(typeof PageShape)["create"]>;
