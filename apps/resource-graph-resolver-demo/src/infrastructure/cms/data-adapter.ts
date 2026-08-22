import type { DataResolutionPull, ResourceKey } from "@xndrjs/resource-graph-resolver";

import { cmsAssetAri, cmsEntryAri, type CmsAssetResource, type CmsEntryResource } from "./ari.js";
import type { CmsContentRegistry } from "./content-registry.js";
import type {
  ContentfulAsset,
  ContentfulLocaleCode,
  ContentfulResolvedEntry,
} from "./generated/contentful.schemas.js";

const CMS_ENTRY_BATCH_SIZE = 5;
const CMS_ASSET_BATCH_SIZE = 5;

export { CMS_ENTRY_BATCH_SIZE, CMS_ASSET_BATCH_SIZE };

export type CmsFixtureStore = {
  entries: ReadonlyMap<string, ContentfulResolvedEntry>;
  assets: ReadonlyMap<string, ContentfulAsset>;
};

/**
 * CMS batch loader — not a DataResolutionPort.
 * Mimics Contentful Delivery `sys.id[in]=…` fetches for entries and assets.
 * Locale is part of the ARI key; the demo store still holds one payload per sys.id.
 */
export type CmsDataLoader = {
  loadEntries(
    resources: readonly CmsEntryResource[]
  ): Promise<ReadonlyMap<ResourceKey, ContentfulResolvedEntry>>;
  loadAssets(
    resources: readonly CmsAssetResource[]
  ): Promise<ReadonlyMap<ResourceKey, ContentfulAsset>>;
  process(
    pull: DataResolutionPull
  ): Promise<ReadonlyMap<ResourceKey, CmsContentRegistry[keyof CmsContentRegistry]>>;
};

export function createCmsDataLoader(store: CmsFixtureStore): CmsDataLoader {
  return {
    async loadEntries(resources) {
      const ids = uniqueIds(resources);
      const fetched = await mockContentfulEntriesByIds(store.entries, ids);
      return mapDemoCmsBatch(resources, fetched);
    },

    async loadAssets(resources) {
      const ids = uniqueIds(resources);
      const fetched = await mockContentfulAssetsByIds(store.assets, ids);
      return mapDemoCmsBatch(resources, fetched);
    },

    async process(pull) {
      const entryBatch = pull.take(cmsEntryAri.matches, CMS_ENTRY_BATCH_SIZE);
      const assetBatch = pull.take(cmsAssetAri.matches, CMS_ASSET_BATCH_SIZE);

      const [entryResult, assetResult] = await Promise.all([
        this.loadEntries(entryBatch),
        this.loadAssets(assetBatch),
      ]);

      return mergeCmsResults(entryResult, assetResult);
    },
  };
}

type CmsResourceWithId = {
  format(): string;
  key: readonly [{ id: string; locale: ContentfulLocaleCode }];
};

/** Demo helper: map in-memory store rows back to ARI keys. */
function mapDemoCmsBatch<T>(
  resources: readonly CmsResourceWithId[],
  fetched: ReadonlyMap<string, T>
): Map<ResourceKey, T> {
  const result = new Map<ResourceKey, T>();
  for (const resource of resources) {
    const value = fetched.get(resource.key[0].id);
    if (value) {
      result.set(resource.format(), value);
    }
  }
  return result;
}

function uniqueIds(resources: readonly CmsResourceWithId[]): string[] {
  return [...new Set(resources.map((resource) => resource.key[0].id))];
}

function mergeCmsResults(
  ...maps: ReadonlyMap<ResourceKey, CmsContentRegistry[keyof CmsContentRegistry]>[]
): Map<ResourceKey, CmsContentRegistry[keyof CmsContentRegistry]> {
  const merged = new Map<ResourceKey, CmsContentRegistry[keyof CmsContentRegistry]>();
  for (const map of maps) {
    for (const [key, value] of map) {
      merged.set(key, value);
    }
  }
  return merged;
}

/** Simulates `GET /entries?sys.id[in]=id1,id2,…` against an in-memory entry map. */
async function mockContentfulEntriesByIds(
  entries: ReadonlyMap<string, ContentfulResolvedEntry>,
  ids: readonly string[]
): Promise<Map<string, ContentfulResolvedEntry>> {
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
  ids: readonly string[]
): Promise<Map<string, ContentfulAsset>> {
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
