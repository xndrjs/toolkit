import { capabilities } from "./capabilities";
import { primitive } from "./primitive";
import { proof } from "./proof";
import { shape } from "./shape";
import { arrayOf, objectFromFields, optional } from "./validation-compose";

/**
 * Primary runtime entry points. `pipe` and `DomainValidationError` are also root exports.
 *
 * Modeling factories that take a {@link Validator} live under {@link domain.core}.
 * Adapter packages (`@xndrjs/domain-zod`, `@xndrjs/domain-valibot`) add top-level
 * `shape` / `primitive` / `proof` that accept native schemas and keep `domain.core` for Validators.
 */
export const domain = {
  core: {
    primitive,
    shape,
    proof,
  },
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

export type { PrimitiveKit, PrimitiveKitCore, Scalar, ScalarOutput } from "./primitive";
export type { ProofFactory, ProofKit, ProofValue } from "./proof";
export type { KitInstance } from "./kit-instance";
export type {
  CapabilityBundle,
  CapabilityMethods,
  CapabilityPatchFn,
  CapabilityPrimitiveContract,
  CapabilityShapeContract,
  PrimitiveAttachMismatchError,
  PrimitiveCapabilityBundle,
  PrimitiveCapabilityFactoryContext,
  PrimitiveCapabilityKit,
  PrimitiveCapabilityMethods,
  PrimitiveCapabilitiesBuilder,
  PrimitiveKitCapabilitiesBuilder,
  ShapeAttachMismatchError,
  ShapeCapabilitiesBuilder,
  ShapeCapabilityFactoryContext,
  ShapeCapabilityKit,
  ShapeKitCapabilitiesBuilder,
} from "./capabilities";

export type { Brand, BrandMap, Branded, BrandOf, Mutable, PatchDelta } from "./branded";
export type { ValidationFailure, ValidationIssue, ValidationResult, Validator } from "./validation";
