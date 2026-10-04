import { MediaDescriptor, Scalars, type AssetPayload } from "../../../generated/resources";
import type { AssetPayloadWire } from "../schemas/asset.js";

/** Map validated wire shape → Ziel `AssetPayload` (branded scalars / opaque wrap). */
export function mapWireToAssetPayload(wire: AssetPayloadWire): AssetPayload {
  return {
    kind: "Asset",
    id: Scalars.AssetId(wire.id),
    url: wire.url,
    title: wire.title,
    asset_type: wire.asset_type,
    descriptor: MediaDescriptor.wrap(wire.descriptor),
  };
}
