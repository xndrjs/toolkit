import {
  createResourceGraphResolver,
  type ResolutionObserver,
  type ResourceGraphResolver,
  type SchedulingMode,
} from "@xndrjs/naviql";

import { createAssetSource } from "./cms/asset-data-adapter.js";
import { createCustomReferenceSource } from "./cms/custom-reference-data-adapter.js";
import { createEntrySource } from "./cms/entries-data-adapter.js";
import {
  createPageDetailStrategy,
  type ContentRegistry,
  type PageDetailExecutionContext,
  type PageDetailParams,
} from "../generated";

/** Demo DataSources (cms-entries / custom-references / assets). */
export function createDemoSources() {
  return [createCustomReferenceSource(), createEntrySource(), createAssetSource()] as const;
}

export type DemoResolverOptions = {
  params: PageDetailParams;
  /** Walk scheduling mode. Defaults to `"lane"`. */
  schedulingMode?: SchedulingMode;
  observer?: ResolutionObserver;
};

/**
 * Low-level wire: sources + generated strategy `.build()`.
 * Prefer `resolvePageDetail` from generated for the closed façade.
 */
export function createDemoResolver(
  options: DemoResolverOptions
): ResourceGraphResolver<ContentRegistry, PageDetailExecutionContext> {
  return createResourceGraphResolver<ContentRegistry, PageDetailExecutionContext>({
    sources: [...createDemoSources()],
    strategy: createPageDetailStrategy(options.params).build(),
    schedulingMode: options.schedulingMode ?? "lane",
    observer: options.observer,
  });
}
