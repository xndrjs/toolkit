import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { ContentRegistry, ResourceKey } from "./types";

/**
 * Boundary for loading resource values.
 *
 * Implementations may batch, cache, retry, or compose CMS/API adapters.
 * After exhausting retries, omit the resource from the result map — the engine
 * treats absence as a missing resource.
 *
 * Heterogeneous batches are keyed by {@link ResourceKey}; payload typing is
 * enforced when values are written into {@link import("./content-map").ContentMap}.
 */
export interface DataResolutionPort<R extends ContentRegistry = ContentRegistry> {
  resolve(
    resources: readonly ApplicationResourceIdentifier[]
  ): Promise<ReadonlyMap<ResourceKey, R[keyof R]>>;
}
