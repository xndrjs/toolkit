import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import type { DataResolutionPort, ResourceKey } from "@xndrjs/resource-graph-resolver";

import { cmsAssetAri, cmsEntryAri } from "./cms/ari.js";
import type { CmsContentRegistry } from "./cms/content-registry.js";
import type { DemoContentRegistry } from "./content-registry.js";
import { integrationProductAri } from "./integration/ari.js";
import type { IntegrationContentRegistry } from "./integration/content-registry.js";

/**
 * Data gateway: partitions each resolve frontier by ARI source and delegates to
 * CMS / integration adapters injected at construction.
 */
export function createDemoDataGateway(
  cms: DataResolutionPort<CmsContentRegistry>,
  integration: DataResolutionPort<IntegrationContentRegistry>
): DataResolutionPort<DemoContentRegistry> {
  return {
    async resolve(resources) {
      const cmsBatch: ApplicationResourceIdentifier[] = [];
      const integrationBatch: ApplicationResourceIdentifier[] = [];

      for (const resource of resources) {
        if (cmsEntryAri.matches(resource) || cmsAssetAri.matches(resource)) {
          cmsBatch.push(resource);
        } else if (integrationProductAri.matches(resource)) {
          integrationBatch.push(resource);
        }
      }

      const [cmsResult, integrationResult] = await Promise.all([
        cmsBatch.length > 0
          ? cms.resolve(cmsBatch)
          : Promise.resolve(
              new Map() as ReadonlyMap<ResourceKey, CmsContentRegistry[keyof CmsContentRegistry]>
            ),
        integrationBatch.length > 0
          ? integration.resolve(integrationBatch)
          : Promise.resolve(
              new Map() as ReadonlyMap<
                ResourceKey,
                IntegrationContentRegistry[keyof IntegrationContentRegistry]
              >
            ),
      ]);

      const merged = new Map<ResourceKey, DemoContentRegistry[keyof DemoContentRegistry]>();
      for (const [key, value] of cmsResult) {
        merged.set(key, value);
      }
      for (const [key, value] of integrationResult) {
        merged.set(key, value);
      }
      return merged;
    },
  };
}
