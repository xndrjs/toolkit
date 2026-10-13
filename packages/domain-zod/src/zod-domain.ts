import {
  domain as coreDomain,
  type ProofFactory,
  type PrimitiveKit,
  type Scalar,
  type ShapeKit,
  type Validator,
} from "@xndrjs/domain";
import type { z } from "zod";

import { zodToValidator } from "./zod-to-validator";

/** Accept Zod schemas whose input/output are not scalars (object-like shapes, including nullable objects). */
type ZodShapeSchema<Schema extends z.ZodTypeAny> = [z.output<Schema>] extends [Scalar]
  ? never
  : [z.input<Schema>] extends [Scalar]
    ? never
    : Schema;

/** Accept Zod schemas whose input/output are scalars. */
type ZodPrimitiveSchema<Schema extends z.ZodTypeAny> = [z.output<Schema>] extends [Scalar]
  ? [z.input<Schema>] extends [Scalar]
    ? Schema
    : never
  : never;

function shape<Type extends string, Schema extends z.ZodTypeAny>(
  type: Type,
  schema: ZodShapeSchema<Schema>
): ShapeKit<Type, z.input<Schema> & object, z.output<Schema> & object, Record<never, never>> {
  return coreDomain.core.shape(
    type,
    zodToValidator(schema) as Validator<z.input<Schema> & object, z.output<Schema> & object>
  );
}

function primitive<Type extends string, Schema extends z.ZodTypeAny>(
  type: Type,
  schema: ZodPrimitiveSchema<Schema>
): PrimitiveKit<Type, z.input<Schema> & Scalar, z.output<Schema> & Scalar, Record<never, never>> {
  return coreDomain.core.primitive(
    type,
    zodToValidator(schema) as Validator<z.input<Schema> & Scalar, z.output<Schema> & Scalar>
  );
}

function proof<ProofBrand extends string, Schema extends z.ZodTypeAny>(
  brand: ProofBrand,
  schema: Schema
): ProofFactory<ProofBrand, z.input<Schema>, z.output<Schema>> {
  return coreDomain.core.proof(brand, zodToValidator(schema));
}

/**
 * Adapter `domain`: top-level `shape` / `primitive` / `proof` accept Zod schemas.
 * Validator-based factories remain on {@link domain.core} (from `@xndrjs/domain`).
 */
export const domain = {
  ...coreDomain,
  shape,
  primitive,
  proof,
};
