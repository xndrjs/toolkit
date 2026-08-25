import {
  createResourceGraphResolver,
  type ResolutionObserver,
  type ResolutionStrategy,
  type ResourceGraphResolver,
} from "@xndrjs/resource-graph-resolver";

import { createCmsSource, demoCmsStore, type CmsFixtureStore } from "./cms/index.js";
import type { DemoContentRegistry } from "./content-registry.js";
import type { DemoExecutionContext } from "./demo-execution-context.js";
import { createDemoExpansionPort } from "./expansion-policies.js";
import { createIntegrationSource, demoProductCatalog } from "./integration/index.js";
import type { ProductIntegrationSnapshot } from "./integration/catalog.js";

export type DemoResolverOptions = {
  strategy: ResolutionStrategy;
  /** Simulated CMS fetch latency in ms. Default 0. */
  cmsLatencyMs?: number;
  /** Simulated integration fetch latency in ms. Default 0. */
  integrationLatencyMs?: number;
  observer?: ResolutionObserver;
  cmsStore?: CmsFixtureStore;
  productCatalog?: ReadonlyMap<string, ProductIntegrationSnapshot>;
};

/**
 * The demo's whole data topology in one place: two backends, the ARI families
 * each owns, and the expansion policies that discover children.
 *
 * Swapping `strategy` is the only difference between the two demo pages.
 */
export function createDemoResolver(
  options: DemoResolverOptions
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
    strategy: options.strategy,
    observer: options.observer,
  });
}
