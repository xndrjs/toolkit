import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import type { DataResolutionPull, ResolvedResourceRecord } from "@xndrjs/resource-graph-resolver";

import { simulateNetworkLatency } from "../simulate-latency.js";
import { cmsAssetAri, cmsEntryAri, type CmsAssetResource, type CmsEntryResource } from "./ari.js";
import type { CmsContentRegistry } from "./content-registry.js";
import type { ContentfulAsset, ContentfulResolvedEntry } from "./generated/contentful.schemas.js";

const CMS_ENTRY_BATCH_SIZE = 100;
const CMS_ASSET_BATCH_SIZE = 100;

export { CMS_ENTRY_BATCH_SIZE, CMS_ASSET_BATCH_SIZE };

export type CmsFixtureStore = {
  entries: ReadonlyMap<string, ContentfulResolvedEntry>;
  assets: ReadonlyMap<string, ContentfulAsset>;
};

export type CmsDataLoaderOptions = {
  /** Simulated network latency (ms) applied to each entries/assets fetch. Default 0. */
  latencyMs?: number;
};

/** Ownership predicate for CMS ARIs (`cms.entry` / `cms.asset`). */
export function acceptsCmsResource(resource: ApplicationResourceIdentifier): boolean {
  return cmsEntryAri.matches(resource) || cmsAssetAri.matches(resource);
}

/**
 * CMS batch loader — not a DataResolutionPort.
 * Mimics Contentful Delivery `sys.id[in]=…` fetches for entries and assets.
 * Locale is part of the ARI key; the demo store still holds one payload per sys.id.
 * `accepts` supports {@link import("@xndrjs/resource-graph-resolver").ResourceLoader} routing.
 */
export type CmsDataLoader = {
  accepts(resource: ApplicationResourceIdentifier): boolean;
  loadEntries(
    resources: readonly CmsEntryResource[]
  ): Promise<readonly ResolvedResourceRecord<CmsContentRegistry>[]>;
  loadAssets(
    resources: readonly CmsAssetResource[]
  ): Promise<readonly ResolvedResourceRecord<CmsContentRegistry>[]>;
  process(pull: DataResolutionPull): Promise<readonly ResolvedResourceRecord<CmsContentRegistry>[]>;
};

export function createCmsDataLoader(
  store: CmsFixtureStore,
  options?: CmsDataLoaderOptions
): CmsDataLoader {
  const latencyMs = options?.latencyMs ?? 0;

  return {
    accepts: acceptsCmsResource,

    async loadEntries(resources) {
      const ids = uniqueEntryIds(resources);
      const fetched = await mockContentfulEntriesByIds(store.entries, ids, latencyMs);
      return mapDemoEntryBatch(resources, fetched);
    },

    async loadAssets(resources) {
      const ids = uniqueAssetIds(resources);
      const fetched = await mockContentfulAssetsByIds(store.assets, ids, latencyMs);
      return mapDemoAssetBatch(resources, fetched);
    },

    async process(pull) {
      const entryBatch = pull.take(cmsEntryAri.matches, CMS_ENTRY_BATCH_SIZE);
      const assetBatch = pull.take(cmsAssetAri.matches, CMS_ASSET_BATCH_SIZE);

      if (entryBatch.length === 0 && assetBatch.length === 0) {
        return [];
      }

      const [entryResult, assetResult] = await Promise.all([
        entryBatch.length === 0 ? Promise.resolve([]) : this.loadEntries(entryBatch),
        assetBatch.length === 0 ? Promise.resolve([]) : this.loadAssets(assetBatch),
      ]);

      return [...entryResult, ...assetResult];
    },
  };
}

/** Demo helper: map in-memory store rows back to correlated cms.entry records. */
function mapDemoEntryBatch(
  resources: readonly CmsEntryResource[],
  fetched: ReadonlyMap<string, ContentfulResolvedEntry>
): ResolvedResourceRecord<CmsContentRegistry>[] {
  const result: ResolvedResourceRecord<CmsContentRegistry>[] = [];
  for (const resource of resources) {
    const value = fetched.get(resource.key[0].id);
    if (value) {
      result.push({ resource, payload: value });
    }
  }
  return result;
}

/** Demo helper: map in-memory store rows back to correlated cms.asset records. */
function mapDemoAssetBatch(
  resources: readonly CmsAssetResource[],
  fetched: ReadonlyMap<string, ContentfulAsset>
): ResolvedResourceRecord<CmsContentRegistry>[] {
  const result: ResolvedResourceRecord<CmsContentRegistry>[] = [];
  for (const resource of resources) {
    const value = fetched.get(resource.key[0].id);
    if (value) {
      result.push({ resource, payload: value });
    }
  }
  return result;
}

function uniqueEntryIds(resources: readonly CmsEntryResource[]): string[] {
  return [...new Set(resources.map((resource) => resource.key[0].id))];
}

function uniqueAssetIds(resources: readonly CmsAssetResource[]): string[] {
  return [...new Set(resources.map((resource) => resource.key[0].id))];
}

/** Simulates `GET /entries?sys.id[in]=id1,id2,…` against an in-memory entry map. */
async function mockContentfulEntriesByIds(
  entries: ReadonlyMap<string, ContentfulResolvedEntry>,
  ids: readonly string[],
  latencyMs: number
): Promise<Map<string, ContentfulResolvedEntry>> {
  await simulateNetworkLatency(latencyMs);
  const unique = [...new Set(ids)];
  const found = new Map<string, ContentfulResolvedEntry>();
  for (const id of unique) {
    const entry = entries.get(id);
    if (entry) {
      found.set(id, entry);
    }
  }
  return found;
}

/** Simulates `GET /assets?sys.id[in]=id1,id2,…` against an in-memory asset map. */
async function mockContentfulAssetsByIds(
  assets: ReadonlyMap<string, ContentfulAsset>,
  ids: readonly string[],
  latencyMs: number
): Promise<Map<string, ContentfulAsset>> {
  await simulateNetworkLatency(latencyMs);
  const unique = [...new Set(ids)];
  const found = new Map<string, ContentfulAsset>();
  for (const id of unique) {
    const asset = assets.get(id);
    if (asset) {
      found.set(id, asset);
    }
  }
  return found;
}
