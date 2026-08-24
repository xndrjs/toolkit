import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { ContentRegistry, ResolvedResourceRecord } from "../types";

/**
 * Pull handle supplied by {@link import("../engines/barrier-resolve-content-graph-engine").BarrierResolveContentGraphEngine}
 * for one resolution round. Not a general-purpose ARI loading API.
 *
 * `take` removes matching resources in frontier order up to `limit` (omit = all).
 * Leftovers stay for later rounds.
 *
 * `signal` mirrors the engine input abort signal for cooperative cancellation during IO.
 */
export interface DataResolutionPull {
  readonly signal?: AbortSignal;
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
 * Collaborator of {@link import("../engines/barrier-resolve-content-graph-engine").BarrierResolveContentGraphEngine} only.
 * Callers outside the engine should use their own loaders/gateways — not this port.
 *
 * Each {@link process} call should pull enough work to saturate backend batches
 * (per source), then return loaded values. Resources not pulled remain on the
 * frontier for a later round (after expand), and are not missing errors.
 *
 * Omit a pulled resource from the result map after exhausting retries — the engine
 * treats that as a missing resource.
 *
 * Each returned record pairs an ARI with its typed payload so the engine can
 * write into {@link import("../model/content-map").ContentMap} without unchecked casts.
 */
export interface DataResolutionPort<R extends ContentRegistry = ContentRegistry> {
  process(pull: DataResolutionPull): Promise<readonly ResolvedResourceRecord<R>[]>;
}

/**
 * Build a {@link DataResolutionPull} over a mutable list (engine/port unit tests).
 * Taken resources are removed from `resources`.
 */
export function createDataResolutionPull(
  resources: ApplicationResourceIdentifier[],
  options?: { signal?: AbortSignal }
): DataResolutionPull {
  return {
    signal: options?.signal,
    take(accept: (resource: ApplicationResourceIdentifier) => boolean, limit?: number) {
      const batch: ApplicationResourceIdentifier[] = [];
      const max = limit === undefined ? Number.POSITIVE_INFINITY : limit;
      if (max <= 0) {
        return batch;
      }

      const remaining: ApplicationResourceIdentifier[] = [];
      for (const resource of resources) {
        if (batch.length < max && accept(resource)) {
          batch.push(resource);
        } else {
          remaining.push(resource);
        }
      }

      resources.length = 0;
      resources.push(...remaining);
      return batch;
    },
  };
}
