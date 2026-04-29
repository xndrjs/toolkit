import type { Branded } from "./branded";
import { DomainValidationError } from "./errors";
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
 * Branded scalar validated via a {@link Validator}. Nominal distinction is type-only;
 * runtime values are plain `Value` (no `__brand` on the value).
 */
export function primitive<Type extends string, Input, Value>(
  type: Type,
  validator: Validator<Input, Value>
): PrimitiveKit<Type, Input, Value> {
  function create(input: Input): Readonly<Branded<Type, Value>> {
    const result = validator.validate(input);
    if (!result.success) {
      throw new DomainValidationError(`Invalid value for primitive "${type}"`, result.error);
    }
    return result.data as Readonly<Branded<Type, Value>>;
  }

  function safeCreate(input: Input): ValidationResult<Readonly<Branded<Type, Value>>> {
    const result = validator.validate(input);
    if (!result.success) {
      return result;
    }
    return { success: true, data: result.data as Readonly<Branded<Type, Value>> };
  }

  function is(value: unknown): value is Readonly<Branded<Type, Value>> {
    return validator.validate(value as Input).success;
  }

  return {
    type,
    validator,
    create,
    safeCreate,
    is,
  };
}
