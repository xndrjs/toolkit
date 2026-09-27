import type { EditorialDocument } from "./fixtures/store.js";
import { loadCmsAssets } from "./cms/asset-data-adapter.js";
import { loadCmsCustomReferences } from "./cms/custom-reference-data-adapter.js";
import { loadCmsEntries } from "./cms/entries-data-adapter.js";
import {
  createDataSources,
  resolvePageDetail,
  type AssetPayload,
  type ResolvePageDetailInput,
  type ResolvePageDetailResult,
} from "../generated";

export type DemoSourcesOptions = {
  entries?: ReadonlyMap<string, EditorialDocument>;
  assets?: ReadonlyMap<string, AssetPayload>;
};

/** Demo DataSources via generated `createDataSources` (DSL routing + app loaders). */
export function createDemoSources(options: DemoSourcesOptions = {}) {
  return createDataSources({
    CmsCustomReferences: { load: loadCmsCustomReferences },
    CmsEntries: { load: loadCmsEntries(options.entries) },
    CmsAssets: { load: loadCmsAssets(options.assets) },
  });
}

export type DemoResolveOptions = Omit<ResolvePageDetailInput, "sources"> & DemoSourcesOptions;

/**
 * Closed façade: generated `resolvePageDetail` + demo DataSources.
 */
export function resolveDemoPageDetail(
  options: DemoResolveOptions
): Promise<ResolvePageDetailResult> {
  const { entries, assets, ...input } = options;
  return resolvePageDetail({
    ...input,
    sources: createDemoSources({ entries, assets }),
  });
}
