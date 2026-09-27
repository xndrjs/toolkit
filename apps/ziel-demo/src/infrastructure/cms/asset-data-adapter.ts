/**
 * Asset / CDN source — separate batch channel from editorial entries.
 * Lookup by asset `id` within the request's space/environment/locale.
 */
import { defineDataSourceFor, type DataSource } from "@xndrjs/ziel";

import {
  assetAri,
  type AssetPayload,
  type ContentRegistry,
  type PageDetailExecutionContext,
} from "../../generated";
import { demoAssets } from "../fixtures/store.js";

export const ASSET_SOURCE_ID = "cms-assets";

const defineAssetSource = defineDataSourceFor<ContentRegistry, PageDetailExecutionContext>();

export function createAssetSource(
  assets: ReadonlyMap<string, AssetPayload> = demoAssets
): DataSource<ContentRegistry, PageDetailExecutionContext> {
  return defineAssetSource({
    id: ASSET_SOURCE_ID,
    for: [assetAri],
    async load(batch) {
      return batch.map((resource) => {
        if (!assetAri.matches(resource)) {
          return undefined;
        }
        const id = String(resource.key[0].id);
        return assets.get(id);
      });
    },
  });
}
