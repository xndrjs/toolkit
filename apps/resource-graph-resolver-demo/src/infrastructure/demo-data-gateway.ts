import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import type {
  DataResolutionPort,
  DataResolutionPull,
  ResourceKey,
} from "@xndrjs/resource-graph-resolver";

import { cmsAssetAri, cmsEntryAri } from "./cms/ari.js";
import type { CmsDataLoader } from "./cms/data-adapter.js";
import type { DemoContentRegistry } from "./content-registry.js";
import { integrationProductAri } from "./integration/ari.js";
import type { IntegrationDataLoader } from "./integration/data-adapter.js";

const CMS_BATCH_SIZE = 50;
const INTEGRATION_BATCH_SIZE = 10;

/**
 * Engine-facing {@link DataResolutionPort}: pulls from the frontier until per-source
 * batch caps are saturated, then delegates to CMS / integration loaders.
 */
export function createDemoDataGateway(
  cms: CmsDataLoader,
  integration: IntegrationDataLoader
): DataResolutionPort<DemoContentRegistry> {
  return {
    async process(pull) {
      const cmsBatch = takeUpTo(pull, isCmsResource, CMS_BATCH_SIZE);
      const integrationBatch = takeUpTo(
        pull,
        integrationProductAri.matches,
        INTEGRATION_BATCH_SIZE
      );

      const [cmsResult, integrationResult] = await Promise.all([
        cms.load(cmsBatch),
        integration.load(integrationBatch),
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

function isCmsResource(resource: ApplicationResourceIdentifier): boolean {
  return cmsEntryAri.matches(resource) || cmsAssetAri.matches(resource);
}

function takeUpTo(
  pull: DataResolutionPull,
  accept: (resource: ApplicationResourceIdentifier) => boolean,
  limit: number
): ApplicationResourceIdentifier[] {
  const batch: ApplicationResourceIdentifier[] = [];
  for (const resource of pull.matching(accept)) {
    batch.push(resource);
    if (batch.length >= limit) {
      break;
    }
  }
  return batch;
}
