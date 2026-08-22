import type { DataResolutionPort, ResourceKey } from "@xndrjs/resource-graph-resolver";

import type { CmsDataLoader } from "./cms/data-adapter.js";
import type { DemoContentRegistry } from "./content-registry.js";
import type { IntegrationDataLoader } from "./integration/data-adapter.js";

/**
 * Engine-facing {@link DataResolutionPort}: delegates pull + batch loading to each source loader.
 */
export function createDemoDataGateway(
  cms: CmsDataLoader,
  integration: IntegrationDataLoader
): DataResolutionPort<DemoContentRegistry> {
  return {
    async process(pull) {
      const [cmsResult, integrationResult] = await Promise.all([
        cms.process(pull),
        integration.process(pull),
      ]);

      const merged = new Map<ResourceKey, DemoContentRegistry[keyof DemoContentRegistry]>();
      for (const result of [cmsResult, integrationResult]) {
        for (const [key, value] of result) {
          merged.set(key, value);
        }
      }
      return merged;
    },
  };
}
