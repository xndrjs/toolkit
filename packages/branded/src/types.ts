import { z } from "zod";
import { __anemicOutput, __brand, __shapeMarker } from "./private-constants";

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };
/** Partial props or a mutating callback for branded shape `patch`. */
export type PatchDelta<T> = Partial<T> | ((draft: Mutable<T>) => void);

/**
 * Type-only nominal marker via {@link __brand}; **not** present on runtime objects (shapes / refinements).
 */
interface Brand<B extends string> {
  readonly [__brand]: Readonly<Record<B, true>>;
}

/**
 * Base brand utility for custom nominal typing with composable brand maps.
 * Keep it low-level and build domain aliases on top.
 * @typeParam B - Brand name (first, aligned with `primitive` / `shape` runtime args).
 * @typeParam T - Base type being branded.
 */
export type Branded<B extends string, T> = T & Brand<B>;

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
 * Callable surface of shape instance methods.
 * `RowHost` is the shape **row** (no methods), e.g. {@link BrandedShape}.
 *
 * When a method returns `Ret` with `Ret extends RowHost` (typical: delegates to
 * {@link BrandedShapePatchFn}), the call signature uses `T extends RowHost & BrandedMethodSurface<M, RowHost>`
 * so the receiver keeps **methods** on the type (and refinements still extend that). Matching `this`
 * as `any` is only for inferring `Args` / `Ret` without a recursive `this` pattern.
 */
export type BrandedMethodSurface<M extends BrandedMethodDefinitions, RowHost> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- only to infer Args/Ret; avoids recursive `this`
  [K in keyof M]: M[K] extends (this: any, ...args: infer Args) => infer Ret
    ? Ret extends RowHost
      ? <T extends RowHost & BrandedMethodSurface<M, RowHost>>(...args: Args) => T
      : (...args: Args) => Ret
    : OmitThisParameter<M[K]>;
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
 * Composite domain type (object/entity): Zod output row + type-level brand.
 * Add a discriminant (e.g. `type: z.literal("User")`) to the schema when you need one.
 * Runtime identity for **`kit.is`** is prototype identity + Zod `safeParse` on own enumerable props.
 * @typeParam Type - Shape name (nominal brand key; first arg to **`branded.shape`**).
 * @typeParam Props - Typically **`z.output<Schema>`** for that shape.
 */
export type BrandedShape<Type extends string, Props> = Branded<Type, Readonly<Props>>;

/**
 * Zod object schema accepted by **`branded.shape`**. Intentionally open (`any` property map) to align
 * with Zod’s typings for arbitrary object shapes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BrandedZodObjectSchema = z.ZodObject<any>;

/** Type-level counterpart of runtime {@link __shapeMarker} on shape prototypes. */
export interface ShapeMarked {
  readonly [__shapeMarker]: true;
}

/**
 * Entity instance type for a shape kit: branded row + instance method surface.
 */
export type BrandedShapeEntity<
  Type extends string,
  Schema extends BrandedZodObjectSchema,
  Methods extends BrandedMethodDefinitions,
> = ([keyof Methods] extends [never]
  ? BrandedShape<Type, z.output<Schema>>
  : BrandedShape<Type, z.output<Schema>> &
      BrandedMethodSurface<Methods, BrandedShape<Type, z.output<Schema>>>) &
  ShapeMarked;

/**
 * Kit object (first element of {@link BrandedShapeTuple}). Spelled with public {@link BrandedShape} so
 * dependents’ `.d.ts` emit can reference stable types instead of fragile inferred `__brand` paths.
 */
export interface BrandedShapeKit<
  Type extends string,
  Schema extends BrandedZodObjectSchema,
  Methods extends BrandedMethodDefinitions = Record<never, never>,
> {
  create: (input: z.input<Schema>) => BrandedShapeEntity<Type, Schema, Methods>;
  is: (value: unknown) => value is BrandedShapeEntity<Type, Schema, Methods>;
  schema: Schema;
  type: Type;
}

/**
 * Always returns the **base** shape entity type so refinements are not preserved in the type system
 * after a patch (re-apply with `refinement.tryFrom` / `from` when needed). Callers may still pass a
 * refined instance as `entity`; only the return type is widened to the shape kit’s entity.
 */
export type BrandedShapePatchFn<
  Type extends string,
  Schema extends BrandedZodObjectSchema,
  Methods extends BrandedMethodDefinitions = Record<never, never>,
> = <T extends BrandedShapeEntity<Type, Schema, Methods>>(
  entity: T,
  delta: PatchDelta<z.input<Schema>>
) => BrandedShapeEntity<Type, Schema, Methods>;

/** `[kit, patch]` return type of **`branded.shape`**. */
export type BrandedShapeTuple<
  Type extends string,
  Schema extends BrandedZodObjectSchema,
  Methods extends BrandedMethodDefinitions = Record<never, never>,
> = readonly [BrandedShapeKit<Type, Schema, Methods>, BrandedShapePatchFn<Type, Schema, Methods>];

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
 * - only **shape** values (see {@link ShapeMarked} / runtime {@link __shapeMarker}) are expanded:
 *   symbol keys and methods are dropped; properties are mapped with `Anemic` recursively
 * - arrays are mapped element-wise
 * - all other objects (plain records, `Date`, host objects, …) pass through unchanged
 */
export type Anemic<T> = T extends readonly (infer U)[]
  ? Anemic<U>[]
  : T extends object
    ? T extends ShapeMarked
      ? {
          [K in keyof T as K extends symbol ? never : T[K] extends AnyFunction ? never : K]: Anemic<
            T[K]
          >;
        }
      : T
    : T;

/**
 * Nominal marker for values that have been explicitly converted to anemic output.
 * Use this in use-case return types to force a mapping step.
 */
export type AnemicOutput<T> = Anemic<T> & {
  readonly [__anemicOutput]: true;
};

/**
 * Structural minimum for a refinement kit returned by {@link import("./branded-refinement").defineBrandedRefine}.
 * Used to chain refinements without re-stating `when` predicates.
 */
export interface BrandedRefinementKitLink<TInput, TOutput> {
  readonly brand: string;
  from: (value: TInput) => TOutput;
  tryFrom: (value: TInput) => TOutput | null;
  // Wider than the kit’s type guard so sibling kits on the same base stay composable.
  is: (value: TInput) => boolean;
}

/** Kit produced by **`branded.refineChain(firstRefinement).with(…).build()`** (no synthetic `brand`; step kits keep their own). */
export interface CombinedRefinementKit<TInput, TOutput> {
  from: (value: TInput) => TOutput;
  tryFrom: (value: TInput) => TOutput | null;
  is: (value: TInput) => boolean;
}

/**
 * Fluent chain from **`branded.refineChain(firstKit)`**: `.with` adds the next refinement;
 * `.build()` finishes the composite kit (requires at least two refinements total).
 */
export interface BrandedRefinementCombineBuilder<TInput, TCurrent> {
  with<O2>(
    kit: BrandedRefinementKitLink<TCurrent, O2>
  ): BrandedRefinementCombineBuilder<TInput, O2>;
  build(): CombinedRefinementKit<TInput, TCurrent>;
}
