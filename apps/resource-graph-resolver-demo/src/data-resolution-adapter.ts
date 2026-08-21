import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import type { ContentRegistry, ResourceKey } from "@xndrjs/resource-graph-resolver";

/**
 * Source adapter for a subset of the ContentRegistry (CMS or integration).
 * Same resolve signature as {@link import("@xndrjs/resource-graph-resolver").DataResolutionPort},
 * typically with a narrower registry.
 *
 * Implementations mimic remote service calls (batch CMS queries / dedicated endpoints)
 * even when backed by in-memory fixtures.
 */
export interface DataResolutionAdapter<R extends ContentRegistry = ContentRegistry> {
  resolve(
    resources: readonly ApplicationResourceIdentifier[]
  ): Promise<ReadonlyMap<ResourceKey, R[keyof R]>>;
}
