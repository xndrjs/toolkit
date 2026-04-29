import type { Branded, PatchDelta } from "./branded";
import type { ValidationResult } from "./validation";
import type { Validator } from "./validation";

export type ShapeInstance<Type extends string, Props extends object> = Readonly<
  Branded<Type, Props>
>;

/** @internal — patch implementation; not part of the public kit surface. */
export type ShapePatchImpl<Type extends string, Props extends object, Input extends object> = <
  T extends Readonly<Props>,
>(
  instance: T,
  delta: PatchDelta<Input>
) => ShapeInstance<Type, Props>;

export interface ShapeKitCore<Type extends string, Input extends object, Props extends object> {
  readonly type: Type;
  readonly validator: Validator<Input, Props>;

  create(input: Input): ShapeInstance<Type, Props>;
  safeCreate(input: Input): ValidationResult<ShapeInstance<Type, Props>>;
  is(value: unknown): value is ShapeInstance<Type, Props>;

  project<TargetType extends string, TargetInput extends object, TargetProps extends object>(
    instance: Readonly<Props>,
    target: ShapeKitCore<TargetType, TargetInput, TargetProps>
  ): ShapeInstance<TargetType, TargetProps>;
}

export type ShapeKit<
  Type extends string,
  Input extends object,
  Props extends object,
  Methods extends Record<string, (instance: Readonly<Props>, ...args: unknown[]) => unknown>,
> = ShapeKitCore<Type, Input, Props> & Methods;

/**
 * Defines a shape (trusted boundary). Runtime implementation follows in the next milestone.
 */
export function shape<Type extends string, Input extends object, Props extends object>(
  _type: Type,
  _validator: Validator<Input, Props>
): ShapeKit<Type, Input, Props, Record<never, never>> {
  throw new Error("@xndrjs/domain: `shape` is not implemented yet");
}
