import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { ContentRegistry, ResourceKey } from "./types";

/**
 * Pull handle supplied by {@link import("./resolve-content-graph-engine").ResolveContentGraphEngine}
 * for one resolution round. Not a general-purpose ARI loading API.
 *
 * `matching` yields (and removes) resources in frontier order; leftovers stay for later.
 */
export interface DataResolutionPull {
  matching<Resource extends ApplicationResourceIdentifier>(
    accept: (resource: ApplicationResourceIdentifier) => resource is Resource
  ): IterableIterator<Resource>;
  matching(
    accept: (resource: ApplicationResourceIdentifier) => boolean
  ): IterableIterator<ApplicationResourceIdentifier>;
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
 * Yielded resources are removed from `resources` as they are taken.
 */
export function createDataResolutionPull(
  resources: ApplicationResourceIdentifier[]
): DataResolutionPull {
  return {
    *matching(accept: (resource: ApplicationResourceIdentifier) => boolean) {
      for (let i = 0; i < resources.length; ) {
        if (accept(resources[i]!)) {
          const [resource] = resources.splice(i, 1);
          yield resource!;
        } else {
          i++;
        }
      }
    },
  };
}
