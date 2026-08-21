import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { ContentRegistry, ResourceKey } from "./types";

/**
 * Pull handle supplied by {@link import("./resolve-content-graph-engine").ResolveContentGraphEngine}
 * for one resolution round. Not a general-purpose ARI loading API.
 *
 * `take` removes matching resources in frontier order up to `limit` (omit = all).
 * Leftovers stay for later rounds.
 */
export interface DataResolutionPull {
  take<Resource extends ApplicationResourceIdentifier>(
    accept: (resource: ApplicationResourceIdentifier) => resource is Resource,
    limit?: number
  ): Resource[];
  take(
    accept: (resource: ApplicationResourceIdentifier) => boolean,
    limit?: number
  ): ApplicationResourceIdentifier[];
}

/**
 * Collaborator of {@link import("./resolve-content-graph-engine").ResolveContentGraphEngine} only.
 * Callers outside the engine should use their own loaders/gateways — not this port.
 *
 * Each {@link process} call should pull enough work to saturate backend batches
 * (per source), then return loaded values. Resources not pulled remain on the
 * frontier for a later round (after expand), and are not missing errors.
 *
 * Omit a pulled resource from the result map after exhausting retries — the engine
 * treats that as a missing resource.
 *
 * Heterogeneous batches are keyed by {@link ResourceKey}; payload typing is
 * enforced when values are written into {@link import("./content-map").ContentMap}.
 */
export interface DataResolutionPort<R extends ContentRegistry = ContentRegistry> {
  process(pull: DataResolutionPull): Promise<ReadonlyMap<ResourceKey, R[keyof R]>>;
}

/**
 * Build a {@link DataResolutionPull} over a mutable list (engine/port unit tests).
 * Taken resources are removed from `resources`.
 */
export function createDataResolutionPull(
  resources: ApplicationResourceIdentifier[]
): DataResolutionPull {
  return {
    take(accept: (resource: ApplicationResourceIdentifier) => boolean, limit?: number) {
      const batch: ApplicationResourceIdentifier[] = [];
      const max = limit === undefined ? Number.POSITIVE_INFINITY : limit;
      if (max <= 0) {
        return batch;
      }

      for (let i = 0; i < resources.length; ) {
        if (batch.length >= max) {
          break;
        }
        if (accept(resources[i]!)) {
          const [resource] = resources.splice(i, 1);
          batch.push(resource!);
        } else {
          i++;
        }
      }
      return batch;
    },
  };
}
