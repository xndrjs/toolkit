import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import type { ResourceKey } from "@xndrjs/resource-graph-resolver";

import { cmsAssetAri, cmsEntryAri } from "./ari.js";
import type { CmsContentRegistry } from "./content-registry.js";
import type { MockContentfulAsset, MockContentfulEntry } from "./mock-contentful-types.js";

export type CmsFixtureStore = {
  entries: ReadonlyMap<string, MockContentfulEntry>;
  assets: ReadonlyMap<string, MockContentfulAsset>;
};

type CmsEntryResource = ReturnType<typeof cmsEntryAri>;
type CmsAssetResource = ReturnType<typeof cmsAssetAri>;

/**
 * CMS batch loader — not a DataResolutionPort.
 * Mimics Contentful Delivery `sys.id[in]=…` fetches for entries and assets.
 */
export type CmsDataLoader = {
  load(
    resources: readonly ApplicationResourceIdentifier[]
  ): Promise<ReadonlyMap<ResourceKey, CmsContentRegistry[keyof CmsContentRegistry]>>;
};

export function createCmsDataLoader(store: CmsFixtureStore): CmsDataLoader {
  return {
    async load(resources) {
      const entryIds: string[] = [];
      const assetIds: string[] = [];
      const entryAris: CmsEntryResource[] = [];
      const assetAris: CmsAssetResource[] = [];

      for (const resource of resources) {
        if (cmsEntryAri.matches(resource)) {
          entryIds.push(resource.key[0].id);
          entryAris.push(resource);
        } else if (cmsAssetAri.matches(resource)) {
          assetIds.push(resource.key[0].id);
          assetAris.push(resource);
        }
      }

      const fetchedEntries = await mockContentfulEntriesByIds(store.entries, entryIds);
      const fetchedAssets = await mockContentfulAssetsByIds(store.assets, assetIds);

      const result = new Map<ResourceKey, CmsContentRegistry[keyof CmsContentRegistry]>();

      for (const resource of entryAris) {
        const entry = fetchedEntries.get(resource.key[0].id);
        if (entry) {
          result.set(resource.format(), entry);
        }
      }

      for (const resource of assetAris) {
        const asset = fetchedAssets.get(resource.key[0].id);
        if (asset) {
          result.set(resource.format(), asset);
        }
      }

      return result;
    },
  };
}

/** Simulates `GET /entries?sys.id[in]=id1,id2,…` against an in-memory entry map. */
async function mockContentfulEntriesByIds(
  entries: ReadonlyMap<string, MockContentfulEntry>,
  ids: readonly string[]
): Promise<Map<string, MockContentfulEntry>> {
  const unique = [...new Set(ids)];
  const found = new Map<string, MockContentfulEntry>();
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
  assets: ReadonlyMap<string, MockContentfulAsset>,
  ids: readonly string[]
): Promise<Map<string, MockContentfulAsset>> {
  const unique = [...new Set(ids)];
  const found = new Map<string, MockContentfulAsset>();
  for (const id of unique) {
    const asset = assets.get(id);
    if (asset) {
      found.set(id, asset);
    }
  }
  return found;
}
