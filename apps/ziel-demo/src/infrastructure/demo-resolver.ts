import type { EditorialDocument } from "./fixtures/store.js";
import { loadCmsAssets } from "./cms/asset-data-adapter.js";
import { loadCmsCustomReferences } from "./cms/custom-reference-data-adapter.js";
import { loadCmsEntries } from "./cms/entries-data-adapter.js";
import { loadErrorLabStore } from "./cms/error-lab-data-adapter.js";
import {
  createDataSources,
  resolveErrorHandlingDetail,
  resolvePageDetail,
  type AssetPayload,
  type ErrorLabPayload,
  type ResolveErrorHandlingDetailInput,
  type ResolveErrorHandlingDetailResult,
  type ResolvePageDetailInput,
  type ResolvePageDetailResult,
} from "../generated";

export type DemoSourcesOptions = {
  entries?: ReadonlyMap<string, EditorialDocument>;
  errorLabs?: ReadonlyMap<string, ErrorLabPayload>;
  assets?: ReadonlyMap<string, AssetPayload>;
};

/** Demo DataSources via generated `createDataSources` (DSL routing + app loaders). */
export function createDemoSources(options: DemoSourcesOptions = {}) {
  return createDataSources({
    CmsCustomReferences: { load: loadCmsCustomReferences },
    CmsEntries: { load: loadCmsEntries(options.entries) },
    ErrorLabStore: { load: loadErrorLabStore(options.errorLabs) },
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
  const { entries, errorLabs, assets, ...input } = options;
  return resolvePageDetail({
    ...input,
    sources: createDemoSources({ entries, errorLabs, assets }),
  });
}

export type DemoResolveErrorHandlingOptions = Omit<ResolveErrorHandlingDetailInput, "sources"> &
  DemoSourcesOptions;

/**
 * Closed façade: generated `resolveErrorHandlingDetail` + demo DataSources.
 */
export function resolveDemoErrorHandlingDetail(
  options: DemoResolveErrorHandlingOptions
): Promise<ResolveErrorHandlingDetailResult> {
  const { entries, errorLabs, assets, ...input } = options;
  return resolveErrorHandlingDetail({
    ...input,
    sources: createDemoSources({ entries, errorLabs, assets }),
  });
}
