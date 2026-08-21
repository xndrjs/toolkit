import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { ResourceKey } from "./types";

/**
 * Boundary for loading resource values.
 *
 * Implementations may batch, cache, retry, or compose CMS/API adapters.
 * After exhausting retries, omit the resource from the result map — the use-case
 * treats absence as a missing resource.
 */
export interface DataResolutionPort {
  resolve(
    resources: readonly ApplicationResourceIdentifier[]
  ): Promise<ReadonlyMap<ResourceKey, unknown>>;
}
