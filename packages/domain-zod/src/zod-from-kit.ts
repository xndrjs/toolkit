import type { Branded, PrimitiveKit, ShapeInstance, ShapeKitCore } from "@xndrjs/domain";
import { z } from "zod";

/**
 * Zod field that composes a kit as a child schema:
 * - `zodFromKit(kit)`: uses `kit.validator.validate` (works with core kits from any adapter)
 * - `zodFromKit(schema, kit)`: parses with explicit Zod schema, then materializes via `kit.create`
 */

/** Parsed raw input, or an existing kit value (same runtime shape; nominal types differ). */
type FieldIn<Schema extends z.ZodTypeAny, Out> = z.input<Schema> | Out;

export function zodFromKit<Type extends string, Input, Value>(
  kit: PrimitiveKit<Type, Input, Value>
): z.ZodType<Readonly<Branded<Type, Value>>, Input | Readonly<Branded<Type, Value>>>;

export function zodFromKit<Type extends string, Input extends object, Props extends object>(
  kit: ShapeKitCore<Type, Input, Props>
): z.ZodType<ShapeInstance<Type, Props>, Input | ShapeInstance<Type, Props>>;

export function zodFromKit<Schema extends z.ZodTypeAny, Type extends string, Input, Value>(
  schema: Schema,
  kit: PrimitiveKit<Type, Input, Value>
): z.ZodType<Readonly<Branded<Type, Value>>, FieldIn<Schema, Readonly<Branded<Type, Value>>>>;

export function zodFromKit<
  Schema extends z.ZodTypeAny,
  Type extends string,
  Input extends object,
  Props extends object,
>(
  schema: Schema,
  kit: ShapeKitCore<Type, Input, Props>
): z.ZodType<ShapeInstance<Type, Props>, FieldIn<Schema, ShapeInstance<Type, Props>>>;

export function zodFromKit(
  schemaOrKit:
    | z.ZodTypeAny
    | PrimitiveKit<string, unknown, unknown>
    | ShapeKitCore<string, object, object>,
  kit?: PrimitiveKit<string, unknown, unknown> | ShapeKitCore<string, object, object>
): z.ZodType<unknown, unknown> {
  if (kit !== undefined) {
    const schema = schemaOrKit as z.ZodTypeAny;
    return schema.transform((raw) => kit.create(raw as never)) as z.ZodType<unknown, unknown>;
  }
  const k = schemaOrKit as
    | PrimitiveKit<string, unknown, unknown>
    | ShapeKitCore<string, object, object>;
  return z
    .unknown()
    .superRefine((input, ctx) => {
      const result = k.validator.validate(input);
      if (result.success) {
        return;
      }
      for (const issue of result.error.issues) {
        ctx.addIssue({
          code: "custom",
          message: issue.message,
          path: [...issue.path],
        });
      }
    })
    .transform((raw) => k.create(raw as never)) as z.ZodType<unknown, unknown>;
}
