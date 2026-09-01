import {
  createResourceGraphResolver,
  type ResolutionObserver,
  type SchedulingMode,
  type ResourceGraphResolver,
} from "@xndrjs/resource-graph-resolver";

import { createCmsSource, demoCmsStore, type CmsFixtureStore } from "./cms/index.js";
import type { DemoContentRegistry } from "./content-registry.js";
import type { DemoExecutionContext } from "./demo-execution-context.js";
import { createDemoExpansionPort, createDemoIslandPort } from "./expansion-policies.js";
import { createIntegrationSource, demoProductCatalog } from "./integration/index.js";
import type { ProductIntegrationSnapshot } from "./integration/catalog.js";

export type DemoResolverOptions = {
  /**
   * Walk scheduling mode. Defaults to `"lane"`.
   * Pass `"barrier"` only when comparing schedulers by hand.
   */
  schedulingMode?: SchedulingMode;
  /** Simulated CMS fetch latency in ms. Default 0. */
  cmsLatencyMs?: number;
  /** Simulated integration fetch latency in ms. Default 0. */
  integrationLatencyMs?: number;
  observer?: ResolutionObserver;
  cmsStore?: CmsFixtureStore;
  productCatalog?: ReadonlyMap<string, ProductIntegrationSnapshot>;
};

/**
 * Demo wiring in one place: two backends, the ARI families each owns, and the
 * expansion policies that discover children.
 */
export function createDemoResolver(
  options: DemoResolverOptions = {}
): ResourceGraphResolver<DemoContentRegistry, DemoExecutionContext> {
  return createResourceGraphResolver<DemoContentRegistry, DemoExecutionContext>({
    sources: [
      createCmsSource(options.cmsStore ?? demoCmsStore, {
        latencyMs: options.cmsLatencyMs ?? 0,
      }),
      createIntegrationSource(options.productCatalog ?? demoProductCatalog, {
        latencyMs: options.integrationLatencyMs ?? 0,
      }),
    ],
    expansion: createDemoExpansionPort(),
    islands: createDemoIslandPort(),
    schedulingMode: options.schedulingMode ?? "lane",
    observer: options.observer,
  });
}
