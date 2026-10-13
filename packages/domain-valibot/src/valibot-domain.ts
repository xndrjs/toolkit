import {
  domain as coreDomain,
  type ProofFactory,
  type PrimitiveKit,
  type Scalar,
  type ShapeKit,
  type Validator,
} from "@xndrjs/domain";
import * as v from "valibot";

import { valibotToValidator } from "./valibot-to-validator";

/** Accept Valibot schemas whose input/output are not scalars (object-like shapes, including nullable objects). */
type ValibotShapeSchema<Schema extends v.GenericSchema> = [v.InferOutput<Schema>] extends [Scalar]
  ? never
  : [v.InferInput<Schema>] extends [Scalar]
    ? never
    : Schema;

/** Accept Valibot schemas whose input/output are scalars. */
type ValibotPrimitiveSchema<Schema extends v.GenericSchema> = [v.InferOutput<Schema>] extends [
  Scalar,
]
  ? [v.InferInput<Schema>] extends [Scalar]
    ? Schema
    : never
  : never;

function shape<Type extends string, Schema extends v.GenericSchema>(
  type: Type,
  schema: ValibotShapeSchema<Schema>
): ShapeKit<
  Type,
  v.InferInput<Schema> & object,
  v.InferOutput<Schema> & object,
  Record<never, never>
> {
  return coreDomain.core.shape(
    type,
    valibotToValidator(schema) as Validator<
      v.InferInput<Schema> & object,
      v.InferOutput<Schema> & object
    >
  );
}

function primitive<Type extends string, Schema extends v.GenericSchema>(
  type: Type,
  schema: ValibotPrimitiveSchema<Schema>
): PrimitiveKit<
  Type,
  v.InferInput<Schema> & Scalar,
  v.InferOutput<Schema> & Scalar,
  Record<never, never>
> {
  return coreDomain.core.primitive(
    type,
    valibotToValidator(schema) as Validator<
      v.InferInput<Schema> & Scalar,
      v.InferOutput<Schema> & Scalar
    >
  );
}

function proof<ProofBrand extends string, Schema extends v.GenericSchema>(
  brand: ProofBrand,
  schema: Schema
): ProofFactory<ProofBrand, v.InferInput<Schema>, v.InferOutput<Schema>> {
  return coreDomain.core.proof(brand, valibotToValidator(schema));
}

/**
 * Adapter `domain`: top-level `shape` / `primitive` / `proof` accept Valibot schemas.
 * Validator-based factories remain on {@link domain.core} (from `@xndrjs/domain`).
 */
export const domain = {
  ...coreDomain,
  shape,
  primitive,
  proof,
};
