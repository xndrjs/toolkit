import type { Branded, PrimitiveKit, Scalar, ShapeInstance, ShapeKitCore } from "@xndrjs/domain";
import { z } from "zod";

/**
 * Zod field that composes a kit as a child schema: validates through `kit.validator`,
 * then materializes via `kit.create`. Parsing and transforms belong on the kit’s validator,
 * not in a parallel Zod chain.
 */

export function zodFromKit<Type extends string, Input extends Scalar, Value extends Scalar>(
  kit: PrimitiveKit<Type, Input, Value>
): z.ZodType<Branded<Type, Value>, Input | Branded<Type, Value>>;

export function zodFromKit<Type extends string, Input extends object, Props extends object>(
  kit: ShapeKitCore<Type, Input, Props>
): z.ZodType<ShapeInstance<Type, Props>, Input | ShapeInstance<Type, Props>>;

export function zodFromKit(
  kit: PrimitiveKit<string, Scalar, Scalar> | ShapeKitCore<string, object, object>
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
