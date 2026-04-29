import type { Branded, PrimitiveKit, ShapeInstance, ShapeKitCore } from "@xndrjs/domain";
import type { z } from "zod";

import type { ZodPrimitiveKit, ZodShapeKit } from "./zod-kit";

/**
 * Zod field that parses with a schema, then builds the nominal value via `kit.create`.
 * Prefer `brandedField(zodKit)` with {@link ZodPrimitiveKit} / {@link ZodShapeKit} so the field reuses `zodSchema`;
 * use `brandedField(schema, kit)` when the field schema must differ from the kit’s.
 */

/** Parsed raw input, or an existing kit value (same runtime shape; nominal types differ). */
type FieldIn<Schema extends z.ZodTypeAny, Out> = z.input<Schema> | Out;

export function brandedField<Type extends string, Schema extends z.ZodTypeAny, Input, Value>(
  kit: ZodPrimitiveKit<Type, Schema, Input, Value>
): z.ZodType<Readonly<Branded<Type, Value>>, FieldIn<Schema, Readonly<Branded<Type, Value>>>>;

export function brandedField<
  Type extends string,
  Schema extends z.ZodTypeAny,
  Input extends object,
  Props extends object,
  Methods extends object,
>(
  kit: ZodShapeKit<Type, Schema, Input, Props, Methods>
): z.ZodType<ShapeInstance<Type, Props>, FieldIn<Schema, ShapeInstance<Type, Props>>>;

export function brandedField<Schema extends z.ZodTypeAny, Type extends string, Input, Value>(
  schema: Schema,
  kit: PrimitiveKit<Type, Input, Value>
): z.ZodType<Readonly<Branded<Type, Value>>, FieldIn<Schema, Readonly<Branded<Type, Value>>>>;

export function brandedField<
  Schema extends z.ZodTypeAny,
  Type extends string,
  Input extends object,
  Props extends object,
>(
  schema: Schema,
  kit: ShapeKitCore<Type, Input, Props>
): z.ZodType<ShapeInstance<Type, Props>, FieldIn<Schema, ShapeInstance<Type, Props>>>;

export function brandedField(
  schemaOrKit:
    | z.ZodTypeAny
    | ZodPrimitiveKit<string, z.ZodTypeAny>
    | ZodShapeKit<string, z.ZodTypeAny>,
  kit?: PrimitiveKit<string, unknown, unknown> | ShapeKitCore<string, object, object>
): z.ZodType<unknown, unknown> {
  if (kit !== undefined) {
    const schema = schemaOrKit as z.ZodTypeAny;
    return schema.transform((raw) => kit.create(raw as never)) as z.ZodType<unknown, unknown>;
  }
  const k = schemaOrKit as
    | ZodPrimitiveKit<string, z.ZodTypeAny>
    | ZodShapeKit<string, z.ZodTypeAny>;
  return k.zodSchema.transform((raw) => k.create(raw as never)) as z.ZodType<unknown, unknown>;
}
