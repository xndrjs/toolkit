import { openRefinementCombineChain } from "./combine-refinements";
import { defineBrandedField } from "./branded-field";
import { defineBrandedRefine } from "./branded-refinement";
import { defineBrandedPrimitive } from "./branded-primitive";
import { defineBrandedShape } from "./branded-shape";
import { toAnemicOutput } from "./anemic";
import * as Presets from "./presets";

/**
 * Namespaced kit API.
 */
export const branded = {
  primitive: defineBrandedPrimitive,
  shape: defineBrandedShape,
  field: defineBrandedField,
  refine: defineBrandedRefine,
  refineChain: openRefinementCombineChain,
} as const;

export const anemic = {
  from: toAnemicOutput,
};

export const presets = Presets;
