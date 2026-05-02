import type { Branded, PrimitiveKit, ShapeInstance, ShapeKitCore } from "@xndrjs/domain";
import { z } from "zod";

/**
 * Zod field that composes a kit as a child schema: validates through `kit.validator`,
 * then materializes via `kit.create`. Parsing and transforms belong on the kit’s validator,
 * not in a parallel Zod chain.
 */

export function zodFromKit<Type extends string, Input, Value>(
  kit: PrimitiveKit<Type, Input, Value>
): z.ZodType<Readonly<Branded<Type, Value>>, Input | Readonly<Branded<Type, Value>>>;

export function zodFromKit<Type extends string, Input extends object, Props extends object>(
  kit: ShapeKitCore<Type, Input, Props>
): z.ZodType<ShapeInstance<Type, Props>, Input | ShapeInstance<Type, Props>>;

export function zodFromKit(
  kit: PrimitiveKit<string, unknown, unknown> | ShapeKitCore<string, object, object>
): z.ZodType<unknown, unknown> {
  return z
    .unknown()
    .superRefine((input, ctx) => {
      const result = kit.validator.validate(input);
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
    .transform((raw) => kit.create(raw as never)) as z.ZodType<unknown, unknown>;
}
