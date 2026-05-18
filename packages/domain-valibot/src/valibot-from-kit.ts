import type { Branded, PrimitiveKit, Scalar, ShapeInstance, ShapeKitCore } from "@xndrjs/domain";
import * as v from "valibot";

const DEFAULT_MESSAGE = "Invalid value for kit";

type ShapeField<Type extends string, Input extends object, Props extends object> = v.GenericSchema<
  Input | ShapeInstance<Type, Props>,
  ShapeInstance<Type, Props>
>;

type PrimitiveField<
  Type extends string,
  Input extends Scalar,
  Value extends Scalar,
> = v.GenericSchema<Input | Branded<Type, Value>, Branded<Type, Value>>;

export function valibotFromKit<Type extends string, Input extends Scalar, Value extends Scalar>(
  kit: PrimitiveKit<Type, Input, Value>
): PrimitiveField<Type, Input, Value>;

export function valibotFromKit<Type extends string, Input extends object, Props extends object>(
  kit: ShapeKitCore<Type, Input, Props>
): ShapeField<Type, Input, Props>;

export function valibotFromKit(
  kit: PrimitiveKit<string, Scalar, Scalar> | ShapeKitCore<string, object, object>
): v.GenericSchema<unknown, unknown> {
  return v.pipe(
    v.unknown(),
    v.check((input) => kit.validator.validate(input).success, DEFAULT_MESSAGE),
    v.transform((input) => kit.create(input as never))
  );
}
