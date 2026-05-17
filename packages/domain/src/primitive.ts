import type { Branded } from "./branded";
import { DomainValidationError } from "./errors";
import type { Scalar, ScalarOutput } from "./scalar";
import type { ValidationResult } from "./validation";
import type { Validator } from "./validation";

export type { Scalar, ScalarOutput };

export interface PrimitiveKitCore<Type extends string, Input extends Scalar, Value extends Scalar> {
  readonly type: Type;
  readonly validator: Validator<Input, Value>;

  create(input: Input): Branded<Type, Value>;
  safeCreate(input: Input): ValidationResult<Branded<Type, Value>>;
  is(value: unknown): value is Branded<Type, Value>;
}

export type PrimitiveKit<
  Type extends string,
  Input extends Scalar,
  Value extends Scalar,
  Methods extends object = Record<never, never>,
> = PrimitiveKitCore<Type, Input, Value> & Methods;

function assertScalarValue(type: string, value: unknown): void {
  if (typeof value === "object" && value !== null) {
    throw new TypeError(
      `Primitive "${type}" validator returned a non-scalar value; primitives accept only scalar outputs`
    );
  }
}

/**
 * Branded scalar validated via a {@link Validator}. Nominal distinction is type-only;
 * runtime values are plain `Value` (no `__brand` on the value).
 */
export function primitive<Type extends string, Input extends Scalar, Value extends Scalar>(
  type: Type,
  validator: Validator<Input, Value>
): PrimitiveKit<Type, Input, Value, Record<never, never>> {
  function create(input: Input): Branded<Type, Value> {
    const result = validator.validate(input);
    if (!result.success) {
      throw new DomainValidationError(`Invalid value for primitive "${type}"`, result.error);
    }
    assertScalarValue(type, result.data);
    return result.data as Branded<Type, Value>;
  }

  function safeCreate(input: Input): ValidationResult<Branded<Type, Value>> {
    const result = validator.validate(input);
    if (!result.success) {
      return result;
    }
    assertScalarValue(type, result.data);
    return { success: true, data: result.data as Branded<Type, Value> };
  }

  function is(value: unknown): value is Branded<Type, Value> {
    const result = validator.validate(value);
    return result.success && (typeof result.data !== "object" || result.data === null);
  }

  return {
    type,
    validator,
    create,
    safeCreate,
    is,
  };
}
