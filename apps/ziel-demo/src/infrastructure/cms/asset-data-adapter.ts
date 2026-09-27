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
} from "../../generated";
import { demoAssets } from "../fixtures/store.js";

export const ASSET_SOURCE_ID = "CmsAssets";

/** App `load` for the generated `CmsAssets` datasource. */
export function loadCmsAssets(assets: ReadonlyMap<string, AssetPayload> = demoAssets) {
  return async (
    batch: readonly AssetResource[],
    _context: ResourceLoadContext<CmsAssetsContext>
  ): Promise<readonly (AssetPayload | undefined)[]> =>
    batch.map((resource) => {
      if (!assetAri.matches(resource)) {
        return undefined;
      }
      const id = String(resource.key[0].id);
      return assets.get(id);
    });
}
