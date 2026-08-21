import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import type { ResourceKey } from "@xndrjs/resource-graph-resolver";

import type { DataResolutionAdapter } from "../data-resolution-adapter.js";
import { cmsAssetAri, cmsEntryAri } from "./ari.js";
import type { CmsContentRegistry } from "./content-registry.js";
import type { MockContentfulAsset, MockContentfulEntry } from "./mock-contentful-types.js";

export type CmsFixtureStore = {
  entries: ReadonlyMap<string, MockContentfulEntry>;
  assets: ReadonlyMap<string, MockContentfulAsset>;
};

/**
 * In-memory CMS adapter that mimics Contentful Delivery batch fetches
 * (`sys.id[in]=…` for entries and assets) rather than one HTTP call per id.
 */
export function createCmsDataAdapter(
  store: CmsFixtureStore
): DataResolutionAdapter<CmsContentRegistry> {
  return {
    async resolve(resources) {
      const entryIds: string[] = [];
      const assetIds: string[] = [];
      const entryAris: ApplicationResourceIdentifier<"cms.entry">[] = [];
      const assetAris: ApplicationResourceIdentifier<"cms.asset">[] = [];

      for (const resource of resources) {
        if (cmsEntryAri.matches(resource)) {
          const id = readIdKey(resource);
          if (id !== undefined) {
            entryIds.push(id);
            entryAris.push(resource);
          }
        } else if (cmsAssetAri.matches(resource)) {
          const id = readIdKey(resource);
          if (id !== undefined) {
            assetIds.push(id);
            assetAris.push(resource);
          }
        }
      }

      // Mimic one batched Entries query + one batched Assets query (Contentful-style).
      const fetchedEntries = await mockContentfulEntriesByIds(store.entries, entryIds);
      const fetchedAssets = await mockContentfulAssetsByIds(store.assets, assetIds);

      const result = new Map<ResourceKey, CmsContentRegistry[keyof CmsContentRegistry]>();

      for (const resource of entryAris) {
        const id = readIdKey(resource)!;
        const entry = fetchedEntries.get(id);
        if (entry) {
          result.set(resource.format(), entry);
        }
      }

      for (const resource of assetAris) {
        const id = readIdKey(resource)!;
        const asset = fetchedAssets.get(id);
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

function readIdKey(resource: ApplicationResourceIdentifier): string | undefined {
  const part = resource.key[0];
  if (typeof part === "object" && part !== null && "id" in part && typeof part.id === "string") {
    return part.id;
  }
  return undefined;
}
