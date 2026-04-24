import { openRefinementCombineChain } from "./combine-refinements";
import { defineBrandedField } from "./branded-field";
import { defineBrandedRefine } from "./branded-refinement";
import { defineBrandedPrimitive } from "./branded-primitive";
import { defineBrandedShape } from "./branded-shape";
import { defineErrorShape } from "./error-shape";
import { toAnemicOutput } from "./anemic";

/**
 * Namespaced kit API.
 */
export const branded = {
  primitive: defineBrandedPrimitive,
  shape: defineBrandedShape,
  errorShape: defineErrorShape,
  field: defineBrandedField,
  refine: defineBrandedRefine,
  refineChain: openRefinementCombineChain,
} as const;

export const anemic = {
  from: toAnemicOutput,
};
