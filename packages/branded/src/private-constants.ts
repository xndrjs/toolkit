// Runtime symbols; re-exported from the package entry for typing / declaration emit (see index.ts).

/**
 * Nominal marker for **TypeScript** (`Branded`); not written onto runtime object instances.
 * Exported so dependents with `declaration: true` can name it in emitted `.d.ts`.
 */
export const __brand: unique symbol = Symbol("__brand");

/**
 * Runtime marker on shape prototypes (non-enumerable). Used by shape **`is`** / validation.
 */
export const __shapeMarker: unique symbol = Symbol("__shapeMarker");

/**
 * Non-enumerable patch function on shape kits. Not part of the public surface; use only if you must
 * reach **`patch`** outside a fluent capabilities bundle
 * (**`branded.capabilities<Props>().methods((patch) => …)`**).
 */
export const __shapePatch: unique symbol = Symbol("__shapePatch");
