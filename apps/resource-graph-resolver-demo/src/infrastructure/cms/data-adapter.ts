import { defineDataSourceFor, type DataSource } from "@xndrjs/resource-graph-resolver";

import type { DemoContentRegistry } from "../content-registry.js";
import type { DemoExecutionContext } from "../demo-execution-context.js";
import { simulateNetworkLatency } from "../simulate-latency.js";
import { cmsAssetAri, cmsEntryAri, type CmsAssetResource, type CmsEntryResource } from "./ari.js";
import type { ContentfulAsset, ContentfulResolvedEntry } from "./generated/contentful.schemas.js";

/** Demo chunk size for batched id-in fetches (client choice, not a Contentful API constant). */
export const CMS_BATCH_SIZE = 100;

export { CMS_BATCH_SIZE as CMS_ENTRY_BATCH_SIZE, CMS_BATCH_SIZE as CMS_ASSET_BATCH_SIZE };

export const CMS_SOURCE_ID = "cms";

export type CmsFixtureStore = {
  entries: ReadonlyMap<string, ContentfulResolvedEntry>;
  assets: ReadonlyMap<string, ContentfulAsset>;
};

export type CmsSourceOptions = {
  /** Simulated network latency (ms) applied to each batch fetch. Default 0. */
  latencyMs?: number;
};

export type CmsEntryRecord = { resource: CmsEntryResource; payload: ContentfulResolvedEntry };
export type CmsAssetRecord = { resource: CmsAssetResource; payload: ContentfulAsset };

const defineCmsSource = defineDataSourceFor<DemoContentRegistry, DemoExecutionContext>();

/**
 * CMS source: owns `cms.entry` and `cms.asset` on one Delivery transport channel.
 *
 * Mimics batched Delivery fetches. Entries and assets share one toy channel here;
 * a real Contentful integration would typically use two sources (separate endpoints).
 *
 * Locale is part of the ARI key; the demo store still holds one payload per sys.id.
 */
export function createCmsSource(
  store: CmsFixtureStore,
  options?: CmsSourceOptions
): DataSource<DemoContentRegistry, DemoExecutionContext> {
  const latencyMs = options?.latencyMs ?? 0;

  return defineCmsSource({
    id: CMS_SOURCE_ID,
    for: [cmsEntryAri, cmsAssetAri],
    batchSize: CMS_BATCH_SIZE,

    async load(batch) {
      if (batch.length === 0) {
        return [];
      }

      await simulateNetworkLatency(latencyMs);

      const records: (CmsEntryRecord | CmsAssetRecord)[] = [];
      for (const resource of batch) {
        if (cmsEntryAri.matches(resource)) {
          const payload = store.entries.get(resource.key[0].id);
          if (payload !== undefined) {
            records.push({ resource, payload });
          }
          continue;
        }

        const payload = store.assets.get(resource.key[0].id);
        if (payload !== undefined) {
          records.push({ resource, payload });
        }
      }

      return records;
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
