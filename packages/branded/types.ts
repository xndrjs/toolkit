import { __brand } from "./private-constants";

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };
export type UpdateInput<T> = Partial<T> | ((draft: Mutable<T>) => void);
export type BrandState = Readonly<Record<string, boolean>>;

/**
 * Base brand utility for custom nominal typing with composable brand maps.
 * Keep it low-level and build domain aliases on top.
 * @typeParam B - Brand name (first, aligned with `primitive` / `shape` runtime args).
 * @typeParam T - Base type being branded.
 */
export type Branded<B extends string, T> = T & {
  readonly [__brand]: BrandState & Readonly<Record<B, true>>;
};

/**
 * Extracts the brand literal from a {@link Branded} type (first type argument).
 */
export type BrandOf<T> = T extends Branded<infer B extends string, infer _> ? B : never;

export type RefinementResult<Brand extends string, NewType> = Branded<Brand, NewType>;

/**
 * Primitive domain type (single runtime value): **type-level only**.
 * At runtime the value is a plain `string` / `number` / etc.; there is no `__brand` field on primitives.
 *
 * @typeParam Type - Primitive / brand name.
 * @typeParam T - Underlying value type.
 */
export type BrandedPrimitive<Type extends string, T> = Branded<Type, T>;

/**
 * Composite domain type (object/entity): readonly props + runtime discriminant + brand.
 * @typeParam Type - Shape / discriminant name.
 * @typeParam Props - Object properties (without `type`; it is added at runtime).
 */
export type BrandedShape<Type extends string, Props> = Branded<
  Type,
  Readonly<Props & { type: Type }>
>;

/**
 * Value type produced by a kit:
 * - primitive / shape: `ReturnType<kit.create>`
 * - refinement: `ReturnType<kit.from>`
 *
 * @example
 * type Email = BrandedType<typeof EmailPrimitive>;
 * type User = BrandedType<typeof UserShape>;
 * type VerifiedUser = BrandedType<typeof VerifiedUserRefinement>;
 */
export type BrandedType<
  Kit extends { create: (input: never) => unknown } | { from: (value: never) => unknown },
> = Kit extends { create: (input: never) => infer R }
  ? R
  : Kit extends { from: (value: never) => infer R }
    ? R
    : never;
