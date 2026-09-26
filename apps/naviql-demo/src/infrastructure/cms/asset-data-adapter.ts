/**
 * Asset / CDN source — separate batch channel from editorial entries.
 * Lookup by asset `id` within the request's space/environment/locale.
 */
import { defineDataSourceFor, type DataSource } from "@xndrjs/naviql";

import {
  assetAri,
  type AssetPayload,
  type ContentRegistry,
  type PageDetailExecutionContext,
} from "../../generated/page-detail.js";
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
      const records: { resource: ReturnType<typeof assetAri>; payload: AssetPayload }[] = [];
      for (const resource of batch) {
        if (!assetAri.matches(resource)) {
          continue;
        }
        const id = String((resource.key[0] as { id: string }).id);
        const payload = assets.get(id);
        if (payload !== undefined) {
          records.push({ resource, payload });
        }
      }
      return records;
    },
  });
}
