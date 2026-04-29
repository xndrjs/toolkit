/** @internal — nominal marker for TypeScript (`Branded`); not written onto runtime primitive values. */
export const __brand: unique symbol = Symbol("__brand");

/** @internal — runtime marker on shape instance prototypes (non-enumerable). */
export const __shapeMarker: unique symbol = Symbol("__shapeMarker");

/** @internal — non-enumerable patch impl on shape kits; use `capabilities.attach` for updates. */
export const __patchImpl: unique symbol = Symbol("__patchImpl");
