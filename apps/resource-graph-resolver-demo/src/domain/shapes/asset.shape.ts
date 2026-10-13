import { domain, type KitInstance } from "@xndrjs/domain-zod";
import { z } from "zod";

/** Resolved Contentful Asset after ContentMap hydrate (not a Link stub). */
export const AssetShape = domain.shape(
  "Asset",
  z.object({
    type: z.literal("Asset"),
    id: z.string().min(1),
    url: z.string().min(1),
    title: z.string().nullable(),
  })
);

export type Asset = KitInstance<typeof AssetShape>;
