import { defineBrandedField } from "./branded-field";
import { defineBrandedProof } from "./branded-proof";
import { defineBrandedPrimitive } from "./branded-primitive";
import { defineBrandedCapabilities, defineBrandedShape } from "./branded-shape";
import * as Presets from "./presets";

/**
 * Namespaced kit API.
 *
 * @deprecated Use `@xndrjs/domain` and `@xndrjs/domain-zod` instead. `@xndrjs/branded` is deprecated.
 */
export const branded = {
  primitive: defineBrandedPrimitive,
  proof: defineBrandedProof,
  shape: defineBrandedShape,
  capabilities: defineBrandedCapabilities,
  field: defineBrandedField,
} as const;

export const presets = Presets;

export { pipe, type Unary } from "./pipe";
