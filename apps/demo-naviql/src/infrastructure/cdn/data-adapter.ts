import { defineDataSourceFor, type DataSource } from "@xndrjs/naviql";

import {
  assetAri,
  type AssetPayload,
  type AssetResource,
  type ContentRegistry,
  type PageDetailExecutionContext,
} from "../../generated/page-detail.js";
import { demoFixtureStore } from "../fixtures/store.js";

export const CDN_SOURCE_ID = "cdn";

type CdnRecord = { resource: AssetResource; payload: AssetPayload };

const defineCdnSource = defineDataSourceFor<ContentRegistry, PageDetailExecutionContext>();

/** Asset metadata source: owns `assetAri`. */
export function createCdnSource(
  store: ReadonlyMap<string, unknown> = demoFixtureStore
): DataSource<ContentRegistry, PageDetailExecutionContext> {
  return defineCdnSource({
    id: CDN_SOURCE_ID,
    for: [assetAri],
    async load(batch) {
      const records: CdnRecord[] = [];
      for (const resource of batch) {
        const payload = store.get(resource.toString());
        if (payload !== undefined) {
          records.push({ resource, payload: payload as AssetPayload });
        }
      }
      return records;
    },
  });
}
