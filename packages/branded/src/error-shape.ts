import { z } from "zod";

import { defineBrandedShape } from "./branded-shape";
import type { BrandedShapeKit, BrandedZodObjectSchema } from "./types";

/**
 * Shared Zod object for domain / application errors. Use **`branded.errorShape(name)`** (and
 * optionally `(base) => base.extend({ … })`) to get a validated, frozen error row with a runtime
 * `type` discriminant. Compose this schema with `.extend()` inside the `errorShape` callback when
 * you need extra fields.
 *
 * `kind` defaults to `"Error"` so callers can pass only `code` and `message`.
 */
export const baseErrorSchema = z.object({
  kind: z.literal("Error").default("Error"),
  code: z.string(),
  message: z.string(),
});

type BaseErrorSchema = typeof baseErrorSchema;

/** Zod object `S` with `type: z.literal(Type).default(Type)` merged into its shape map. */
type ZodWithAppendedType<S extends BrandedZodObjectSchema, Type extends string> =
  S extends z.ZodObject<infer Shape>
    ? z.ZodObject<Shape & { type: z.ZodDefault<z.ZodLiteral<Type>> }>
    : never;

type ErrorShapeKitBase<Type extends string> = BrandedShapeKit<
  Type,
  ZodWithAppendedType<typeof baseErrorSchema, Type>,
  Record<never, never>
>;

type ErrorShapeKitExtended<Type extends string, S extends BrandedZodObjectSchema> = BrandedShapeKit<
  Type,
  ZodWithAppendedType<S, Type>,
  Record<never, never>
>;

/**
 * Branded error shape: {@link baseErrorSchema} (optionally extended) plus a runtime `type`
 * discriminant (`z.literal(name).default(name)`). Returns only the shape kit — errors are
 * immutable; there is no `patch` helper.
 *
 * @param name — Shape brand and value of the `type` field (defaulted on parse).
 * @param extend — Optional `baseErrorSchema.extend(…)` (or equivalent) for extra fields.
 */
export function defineErrorShape<const Type extends string>(name: Type): ErrorShapeKitBase<Type>;

export function defineErrorShape<const Type extends string, S extends BrandedZodObjectSchema>(
  name: Type,
  extend: (base: BaseErrorSchema) => S
): ErrorShapeKitExtended<Type, S>;

export function defineErrorShape(
  name: string,
  extend?: (base: BaseErrorSchema) => BrandedZodObjectSchema
): BrandedShapeKit<string, BrandedZodObjectSchema, Record<never, never>> {
  if (extend === undefined) {
    const schema = baseErrorSchema.extend({
      type: z.literal(name).default(name),
    });
    const [kit] = defineBrandedShape(name, schema, { methods: {} });
    return kit;
  }
  const schema = extend(baseErrorSchema).extend({
    type: z.literal(name).default(name),
  });
  const [kit] = defineBrandedShape(name, schema, { methods: {} });
  return kit;
}
