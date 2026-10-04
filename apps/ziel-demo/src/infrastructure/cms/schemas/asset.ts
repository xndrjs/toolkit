import { z } from "zod";

import { mediaDescriptorWireSchema } from "./media-descriptor.js";

export const assetPayloadSchema = z.object({
  kind: z.literal("Asset"),
  id: z.string(),
  url: z.string(),
  title: z.string(),
  asset_type: z.enum(["image", "video", "document"]),
  descriptor: mediaDescriptorWireSchema,
});

export type AssetPayloadWire = z.infer<typeof assetPayloadSchema>;
