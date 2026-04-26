import { openRefinementCombineChain } from "./combine-refinements";
import { defineBrandedField } from "./branded-field";
import { defineBrandedRefine } from "./branded-refinement";
import { defineBrandedPrimitive } from "./branded-primitive";
import { defineBrandedShape, defineBrandedShapeCapabilities } from "./branded-shape";
import { toAnemicOutput } from "./anemic";
import * as Presets from "./presets";

/**
 * Namespaced kit API.
 */
export const branded = {
  primitive: defineBrandedPrimitive,
  shape: defineBrandedShape,
  capabilities: defineBrandedShapeCapabilities,
  field: defineBrandedField,
  refine: defineBrandedRefine,
  refineChain: openRefinementCombineChain,
} as const;

export const anemic = {
  from: toAnemicOutput,
};

export const presets = Presets;
