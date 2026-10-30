import type { Boundary, Intent, IntentModality } from "./boundary.js";
import { createAdaptProvideApi } from "./provider/provider-builder.js";
import type { AdaptProvideApi } from "./provider/provider-builder.types.js";

/**
 * Architectural identity peer to Boundary: scoped to one target Boundary.
 * Owns external realizations of that target’s Intents via `.adapt`.
 */
export type Adapter<BoundaryId extends string> = {
  readonly id: string;
  readonly target: Boundary<BoundaryId>;
  /**
   * Realize a target-boundary Intent. Compile-time rejects Intents whose
   * `BoundaryId` does not match this Adapter’s target. Preserves modality.
   */
  adapt<Name extends string, Input, Success, Err, Mode extends IntentModality>(
    intent: Intent<BoundaryId, Name, Input, Success, Err, Mode>
  ): AdaptProvideApi<BoundaryId, Name, Input, Success, Err, Mode>;
};

/**
 * Create an Adapter scoped to `targetBoundary`.
 *
 * ```ts
 * adapter("orders-postgres", Orders)
 *   .adapt(FindOrder)
 *   .using({ select: SelectOrder })
 *   .with(({ deps: { select } }) => (id) => select(id));
 * ```
 */
export function adapter<const BoundaryId extends string>(
  id: string,
  targetBoundary: Boundary<BoundaryId>
): Adapter<BoundaryId> {
  return {
    id,
    target: targetBoundary,
    adapt(intent) {
      return createAdaptProvideApi(intent, id);
    },
  };
}
