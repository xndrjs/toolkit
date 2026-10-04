/**
 * Asset / CDN source — separate batch channel from editorial entries.
 * Lookup by asset `id` within the request's space/environment/locale.
 */
import type { ResourceLoadContext } from "@xndrjs/ziel";

import {
  assetAri,
  type AssetPayload,
  type AssetResource,
  type CmsAssetsContext,
} from "../../generated/resources";
import { demoAssets } from "../fixtures/cms-store.js";
import type { AssetPayloadWire } from "./schemas/asset.js";
import { parsePayload } from "../schemas/parse-payload.js";
import { mapWireToAssetPayload } from "./mappers/index.js";
import { assetPayloadSchema } from "./schemas/index.js";

export const ASSET_SOURCE_ID = "CmsAssets";

/** App `load` for the generated `CmsAssets` datasource. */
export function loadCmsAssets(assets: ReadonlyMap<string, AssetPayloadWire> = demoAssets) {
  return async (
    batch: readonly AssetResource[],
    _context: ResourceLoadContext<CmsAssetsContext>
  ): Promise<readonly (AssetPayload | undefined)[]> =>
    batch.map((resource) => {
      if (!assetAri.matches(resource)) {
        return undefined;
      }
      const id = String(resource.key.id);
      const raw = assets.get(id);
      if (raw === undefined) return undefined;
      const wire = parsePayload(assetPayloadSchema, raw, "Asset");
      return mapWireToAssetPayload(wire);
    });
}
