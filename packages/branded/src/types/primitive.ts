import { Branded } from "./common";

/**
 * Primitive domain type (single runtime value): **type-level only**.
 * At runtime the value is a plain `string` / `number` / etc.; there is no `__brand` field on primitives.
 *
 * @typeParam Type - Primitive / brand name.
 * @typeParam T - Underlying value type.
 */
export type BrandedPrimitive<Type extends string, T> = Branded<Type, T>;
