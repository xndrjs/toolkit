import { defineBrandedField } from "./branded-field";
import { defineBrandedProof } from "./branded-proof";
import { defineBrandedPrimitive } from "./branded-primitive";
import { defineBrandedShape, defineBrandedShapeCapabilities } from "./branded-shape";
import * as Presets from "./presets";

/**
 * Namespaced kit API.
 */
export const branded = {
  primitive: defineBrandedPrimitive,
  proof: defineBrandedProof,
  shape: defineBrandedShape,
  capabilities: defineBrandedShapeCapabilities,
  field: defineBrandedField,
} as const;

export const presets = Presets;
