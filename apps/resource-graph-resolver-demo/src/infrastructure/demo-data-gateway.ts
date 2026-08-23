import type { DataResolutionPort, ResolvedResourceRecord } from "@xndrjs/resource-graph-resolver";

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

      return [...cmsResult, ...integrationResult] as ResolvedResourceRecord<DemoContentRegistry>[];
    },
  };
}
