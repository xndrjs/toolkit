import { z } from "zod";

export const assetPayloadSchema = z.object({
  kind: z.literal("Asset"),
  id: z.string(),
  url: z.string(),
  title: z.string(),
  asset_type: z.enum(["image", "video", "document"]),
});

export type AssetPayloadWire = z.infer<typeof assetPayloadSchema>;
