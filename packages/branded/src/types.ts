import { __anemicOutput, __brand } from "./private-constants";

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };
/** Partial props or a mutating callback for branded shape `patch`. */
export type PatchDelta<T> = Partial<T> | ((draft: Mutable<T>) => void);
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
 * Method bag for shape `methods` options (refinements do not add instance methods).
 */
export type BrandedMethodDefinitions = Record<string, (...args: never[]) => unknown>;

/**
 * Callable surface of shape instance methods (strips explicit `this` from signatures).
 */
export type BrandedMethodSurface<M extends BrandedMethodDefinitions> = {
  [K in keyof M]: OmitThisParameter<M[K]>;
};

/**
 * Value type after a refinement: base `TBase` + data narrowing + refinement brand.
 * `NewType` must be the **narrowed data** (e.g. `UserEntity & { … }`), not `Branded<Brand, …>` —
 * {@link RefinementResult} already applies `Branded<Brand, NewType>` once.
 *
 * Instance methods come only from the underlying shape prototype, not from refinements.
 *
 * Matches `from` / `tryFrom` when called with `TBase` (e.g. `UserEntity`). For stacked refinements,
 * `TBase` is the already-refined input type.
 */
export type RefinementInstance<TBase, Brand extends string, NewType> = TBase &
  RefinementResult<Brand, NewType>;

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

/** Return type of a kit’s `create` or `from` method (handles generic call signatures). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- conditional inference only
type KitFnReturn<F> = F extends (...args: any) => infer R ? R : never;

/**
 * Value type produced by a kit:
 * - primitive / shape: return type of **`create`**
 * - refinement: return type of **`from`**
 *
 * @example
 * type Email = BrandedType<typeof EmailPrimitive>;
 * type User = BrandedType<typeof UserShape>;
 * type VerifiedUser = BrandedType<typeof VerifiedUserRefinement>;
 */
export type BrandedType<
  Kit extends { create: (...args: never) => unknown } | { from: (...args: never) => unknown },
> = Kit extends { create: infer Create }
  ? KitFnReturn<Create>
  : Kit extends { from: infer From }
    ? KitFnReturn<From>
    : never;

type AnyFunction = (...args: never[]) => unknown;

/**
 * "Anemic" view of a domain value:
 * - removes symbol keys (e.g. runtime brand metadata)
 * - removes function properties
 * - recursively maps arrays and nested objects
 */
export type Anemic<T> = T extends readonly (infer U)[]
  ? Anemic<U>[]
  : T extends object
    ? {
        [K in keyof T as K extends symbol ? never : T[K] extends AnyFunction ? never : K]: Anemic<
          T[K]
        >;
      }
    : T;

/**
 * Nominal marker for values that have been explicitly converted to anemic output.
 * Use this in use-case return types to force a mapping step.
 */
export type AnemicOutput<T> = Anemic<T> & {
  readonly [__anemicOutput]: true;
};
