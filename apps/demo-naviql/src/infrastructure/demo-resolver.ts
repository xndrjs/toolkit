import {
  createResourceGraphResolver,
  type ResolutionObserver,
  type ResourceGraphResolver,
  type SchedulingMode,
} from "@xndrjs/naviql";

import { createCatalogSource } from "./catalog/data-adapter.js";
import { createCdnSource } from "./cdn/data-adapter.js";
import { createCmsSource } from "./cms/data-adapter.js";
import { createDemoPageStrategy } from "./demo-strategy.js";
import { demoFixtureStore } from "./fixtures/store.js";
import type {
  ContentRegistry,
  PageDetailExecutionContext,
  PageDetailParams,
} from "../generated/page-detail.js";

export type DemoResolverOptions = {
  params: PageDetailParams;
  /** Walk scheduling mode. Defaults to `"lane"`. */
  schedulingMode?: SchedulingMode;
  observer?: ResolutionObserver;
  /** Override the shared in-memory fixture map (tests). */
  store?: ReadonlyMap<string, unknown>;
};

/**
 * Wires the three in-memory backends and the generated page-detail strategy.
 *
 * - cms — editorial graph ARIs
 * - catalog — `productAri`
 * - cdn — `assetAri`
 */
export function createDemoResolver(
  options: DemoResolverOptions
): ResourceGraphResolver<ContentRegistry, PageDetailExecutionContext> {
  const store = options.store ?? demoFixtureStore;

  return createResourceGraphResolver<ContentRegistry, PageDetailExecutionContext>({
    sources: [createCmsSource(store), createCatalogSource(store), createCdnSource(store)],
    strategy: createDemoPageStrategy(options.params),
    schedulingMode: options.schedulingMode ?? "lane",
    observer: options.observer,
  });
}
