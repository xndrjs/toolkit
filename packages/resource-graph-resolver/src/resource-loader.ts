import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { DataResolutionPull } from "./data-resolution-port";
import type { ContentRegistry, ResolvedResourceRecord } from "./types";

/**
 * Source-owned loader for {@link import("./decoupled-resolve-content-graph-engine").DecoupledResolveContentGraphEngine}.
 *
 * Distinct from {@link import("./data-resolution-port").DataResolutionPort}: that port is the
 * barrier engine’s round collaborator. A loader adds {@link accepts} for chain-of-responsibility
 * routing and is invoked on its own serial lane (at most one in-flight {@link process} call).
 *
 * Reuses {@link DataResolutionPull} so the loader decides batch composition via `take`
 * (including multi-family batches and intentional deferral). Callers guarantee that exactly one
 * loader in the ordered chain owns each ARI.
 */
export interface ResourceLoader<R extends ContentRegistry = ContentRegistry> {
  /** Whether this loader owns `resource` (first match in chain order wins). */
  accepts(resource: ApplicationResourceIdentifier): boolean;

  /**
   * Load a batch from this lane’s pull handle.
   * Call `take` before the first `await` when possible so the engine can track in-flight keys promptly.
   */
  process(pull: DataResolutionPull): Promise<readonly ResolvedResourceRecord<R>[]>;
}
