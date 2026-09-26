import {
  createResourceGraphResolver,
  type ResolutionObserver,
  type ResourceGraphResolver,
  type SchedulingMode,
} from "@xndrjs/naviql";

import { createAssetSource } from "./cms/asset-data-adapter.js";
import { createCustomReferenceSource } from "./cms/custom-reference-data-adapter.js";
import { createEntrySource } from "./cms/entries-data-adapter.js";
import { createDemoPageStrategy } from "./demo-strategy.js";
import type { ContentRegistry, PageDetailExecutionContext, PageDetailParams } from "../generated";

export type DemoResolverOptions = {
  params: PageDetailParams;
  /** Walk scheduling mode. Defaults to `"lane"`. */
  schedulingMode?: SchedulingMode;
  observer?: ResolutionObserver;
};

/**
 * Wires three separate batch channels + the generated page-detail strategy.
 *
 * - cms-entries — editorial Page + Entry (one CMS entry endpoint)
 * - cms-custom-references — decode CustomReference locator payload (resolve hops in strategy)
 * - cms-assets — media assets (separate CDN endpoint)
 */
export function createDemoResolver(
  options: DemoResolverOptions
): ResourceGraphResolver<ContentRegistry, PageDetailExecutionContext> {
  return createResourceGraphResolver<ContentRegistry, PageDetailExecutionContext>({
    sources: [createCustomReferenceSource(), createEntrySource(), createAssetSource()],
    strategy: createDemoPageStrategy(options.params),
    schedulingMode: options.schedulingMode ?? "lane",
    observer: options.observer,
  });
}
