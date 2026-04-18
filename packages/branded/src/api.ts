// Do not export constants. It has private __brand const.

import { defineBrandedField } from "./branded-field";
import { defineBrandedPrimitive } from "./branded-primitive";
import { defineBrandedRefinement } from "./branded-refinement";
import { defineBrandedShape } from "./branded-shape";

/**
 * Namespaced kit API.
 */
export const branded = {
  primitive: defineBrandedPrimitive,
  shape: defineBrandedShape,
  field: defineBrandedField,
  refinement: defineBrandedRefinement,
} as const;
