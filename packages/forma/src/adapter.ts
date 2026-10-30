import { isBoundary, type Boundary, type Intent, type IntentModality } from "./boundary.js";
import { createAdaptProvideApi } from "./provider/provider-builder.js";
import type { AdaptProvideApi } from "./provider/provider-builder.types.js";

/**
 * Architectural identity peer to Boundary: scoped to one target Boundary.
 * Owns external realizations of that target’s Intents via `.adapt`.
 */
export type Adapter<AdapterId extends string, BoundaryId extends string> = {
  readonly id: AdapterId;
  readonly target: Boundary<BoundaryId>;
  /**
   * Realize a target-boundary Intent. Compile-time rejects Intents whose
   * `BoundaryId` does not match this Adapter’s target. Preserves modality.
   */
  adapt<Name extends string, Input, Success, Err, Mode extends IntentModality>(
    intent: Intent<BoundaryId, Name, Input, Success, Err, Mode>
  ): AdaptProvideApi<BoundaryId, Name, Input, Success, Err, Mode, AdapterId>;
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
export function adapter<const AdapterId extends string, const BoundaryId extends string>(
  id: AdapterId,
  targetBoundary: Boundary<BoundaryId>
): Adapter<AdapterId, BoundaryId> {
  if (!isBoundary(targetBoundary)) {
    throw new Error("Adapter target must be a Boundary value created by boundary()");
  }

  return Object.freeze({
    id,
    target: targetBoundary,
    adapt(intent) {
      return createAdaptProvideApi(intent, id);
    },
  });
}
