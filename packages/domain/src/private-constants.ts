/**
 * Nominal marker for TypeScript (`Branded`); not written onto runtime primitive values.
 * Exported for declaration emit in dependent projects (`declaration: true`).
 */
export const __brand: unique symbol = Symbol("__brand");

/**
 * Runtime marker on shape instance prototypes (non-enumerable). Used by {@link shape} `is` / validation.
 */
export const __shapeMarker: unique symbol = Symbol("__shapeMarker");

/**
 * Non-enumerable patch implementation on shape kits. Not public API; use `capabilities.attach` to close over patch.
 */
export const __patchImpl: unique symbol = Symbol("__patchImpl");
