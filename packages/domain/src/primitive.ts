import type { Branded } from "./branded";
import type { ValidationResult } from "./validation";
import type { Validator } from "./validation";

export interface PrimitiveKit<Type extends string, Input, Value> {
  readonly type: Type;
  readonly validator: Validator<Input, Value>;

  create(input: Input): Readonly<Branded<Type, Value>>;
  safeCreate(input: Input): ValidationResult<Readonly<Branded<Type, Value>>>;
  is(value: unknown): value is Readonly<Branded<Type, Value>>;
}

/**
 * Defines a primitive value object. Runtime implementation follows in the next milestone.
 */
export function primitive<Type extends string, Input, Value>(
  _type: Type,
  _validator: Validator<Input, Value>
): PrimitiveKit<Type, Input, Value> {
  throw new Error("@xndrjs/domain: `primitive` is not implemented yet");
}
