import { defineResourceSourceFor, type ResourceSource } from "@xndrjs/resource-graph-resolver";

import type { DemoContentRegistry } from "../content-registry.js";
import type { DemoExecutionContext } from "../demo-execution-context.js";
import { simulateNetworkLatency } from "../simulate-latency.js";
import { cmsAssetAri, cmsEntryAri, type CmsAssetResource, type CmsEntryResource } from "./ari.js";
import type { ContentfulAsset, ContentfulResolvedEntry } from "./generated/contentful.schemas.js";

/** Contentful Delivery caps `sys.id[in]` lists, so entries and assets chunk separately. */
const CMS_ENTRY_BATCH_SIZE = 100;
const CMS_ASSET_BATCH_SIZE = 100;

export { CMS_ENTRY_BATCH_SIZE, CMS_ASSET_BATCH_SIZE };

export const CMS_SOURCE_ID = "cms";

export type CmsFixtureStore = {
  entries: ReadonlyMap<string, ContentfulResolvedEntry>;
  assets: ReadonlyMap<string, ContentfulAsset>;
};

export type CmsSourceOptions = {
  /** Simulated network latency (ms) applied to each entries/assets fetch. Default 0. */
  latencyMs?: number;
};

export type CmsEntryRecord = { resource: CmsEntryResource; payload: ContentfulResolvedEntry };
export type CmsAssetRecord = { resource: CmsAssetResource; payload: ContentfulAsset };

const defineCmsSource = defineResourceSourceFor<DemoContentRegistry, DemoExecutionContext>();

/**
 * CMS source: owns `cms.entry` and `cms.asset`.
 *
 * Mimics Contentful Delivery `sys.id[in]=…` fetches. Both families arrive in the
 * same batch, so one round trip per family runs concurrently instead of
 * serializing entries behind assets.
 *
 * Locale is part of the ARI key; the demo store still holds one payload per sys.id.
 */
export function createCmsSource(
  store: CmsFixtureStore,
  options?: CmsSourceOptions
): ResourceSource<DemoContentRegistry, DemoExecutionContext> {
  const latencyMs = options?.latencyMs ?? 0;

  return defineCmsSource({
    id: CMS_SOURCE_ID,
    families: { entry: cmsEntryAri, asset: cmsAssetAri },
    batchSize: { entry: CMS_ENTRY_BATCH_SIZE, asset: CMS_ASSET_BATCH_SIZE },

    async load({ entry, asset }) {
      const [entries, assets] = await Promise.all([
        loadCmsEntries(store, entry, latencyMs),
        loadCmsAssets(store, asset, latencyMs),
      ]);

      return [...entries, ...assets];
    },
  });
}

/** Simulates `GET /entries?sys.id[in]=id1,id2,…` and correlates rows back to ARIs. */
export async function loadCmsEntries(
  store: CmsFixtureStore,
  resources: readonly CmsEntryResource[],
  latencyMs = 0
): Promise<CmsEntryRecord[]> {
  if (resources.length === 0) {
    return [];
  }

  await simulateNetworkLatency(latencyMs);

  const records: CmsEntryRecord[] = [];
  for (const resource of resources) {
    const payload = store.entries.get(resource.key[0].id);
    if (payload !== undefined) {
      records.push({ resource, payload });
    }
  }

  return records;
}

/** Simulates `GET /assets?sys.id[in]=id1,id2,…` and correlates rows back to ARIs. */
export async function loadCmsAssets(
  store: CmsFixtureStore,
  resources: readonly CmsAssetResource[],
  latencyMs = 0
): Promise<CmsAssetRecord[]> {
  if (resources.length === 0) {
    return [];
  }

  await simulateNetworkLatency(latencyMs);

  const records: CmsAssetRecord[] = [];
  for (const resource of resources) {
    const payload = store.assets.get(resource.key[0].id);
    if (payload !== undefined) {
      records.push({ resource, payload });
    }
  }

  return records;
}
