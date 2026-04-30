import { capabilities } from "./capabilities";
import { primitive } from "./primitive";
import { proof } from "./proof";
import { shape } from "./shape";
import { arrayOf, objectFromFields, optional } from "./validation-compose";

/**
 * Primary runtime entry points. `pipe` and `DomainValidationError` are also root exports.
 */
export const domain = {
  primitive,
  shape,
  proof,
  capabilities,
};

/**
 * Validator composition helpers namespace.
 */
export const compose = {
  array: arrayOf,
  object: objectFromFields,
  optional,
};

export { DomainValidationError } from "./errors";
export { pipe, type Unary } from "./pipe";
export type {
  ShapeInstance,
  ShapeKit,
  ShapeKitCore,
  ShapeMarked,
  ShapePatchImpl,
  ShapeProps,
} from "./shape";

export type { PrimitiveKit } from "./primitive";
export type { ProofFactory, ProofKit, ProofValue } from "./proof";
export type {
  CapabilitiesBuilder,
  CapabilityBundle,
  CapabilityMethods,
  CapabilityPatchFn,
} from "./capabilities";

export type { Brand, BrandMap, Branded, BrandOf, Mutable, PatchDelta } from "./branded";
export type { ValidationFailure, ValidationIssue, ValidationResult, Validator } from "./validation";
