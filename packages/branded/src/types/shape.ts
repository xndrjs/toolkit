import { z } from "zod";

import { __shapeMarker } from "../private-constants";
import { Branded, PatchDelta } from "./common";

/**
 * Method bag for shape `methods` options (refinements do not add instance methods).
 */
export type BrandedMethodDefinitions = Record<string, (...args: never[]) => unknown>;

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
 * Callable surface of shape instance methods.
 * `ShapeBaseData` is the shape base entity data (row + shape marker), without methods.
 *
 * When a method returns `Ret` with `Ret extends ShapeBaseData` (typical: delegates to
 * {@link BrandedShapePatchFn}), the call signature uses
 * `T extends ShapeBaseData & BrandedMethodSurface<M, ShapeBaseData>`
 * so the receiver keeps **methods** on the type (and refinements still extend that). Matching `this`
 * as `any` is only for inferring `Args` / `Ret` without a recursive `this` pattern.
 */
export type BrandedMethodSurface<M extends BrandedMethodDefinitions, ShapeBaseData> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- only to infer Args/Ret; avoids recursive `this`
  [K in keyof M]: M[K] extends (this: any, ...args: infer Args) => infer Ret
    ? Ret extends ShapeBaseData
      ? <T extends ShapeBaseData & BrandedMethodSurface<M, ShapeBaseData>>(...args: Args) => T
      : (...args: Args) => Ret
    : OmitThisParameter<M[K]>;
};

type ShapeBaseData<Type extends string, Schema extends BrandedZodObjectSchema> = BrandedShape<
  Type,
  z.output<Schema>
> &
  ShapeMarked & {
    project: ShapeProjectFn<Schema>;
  };

export type ShapeProjectFn<FromSchema extends BrandedZodObjectSchema> = <
  TargetType extends string,
  TargetSchema extends BrandedZodObjectSchema,
  TargetMethods extends BrandedMethodDefinitions = Record<never, never>,
>(
  target: z.output<FromSchema> extends z.input<TargetSchema>
    ? BrandedShapeKit<TargetType, TargetSchema, TargetMethods>
    : never
) => ReturnType<BrandedShapeKit<TargetType, TargetSchema, TargetMethods>["create"]>;

/**
 * Entity instance type for a shape kit: branded row + instance method surface.
 */
export type BrandedShapeEntity<
  Type extends string,
  Schema extends BrandedZodObjectSchema,
  Methods extends BrandedMethodDefinitions,
> = [keyof Methods] extends [never]
  ? ShapeBaseData<Type, Schema>
  : ShapeBaseData<Type, Schema> & BrandedMethodSurface<Methods, ShapeBaseData<Type, Schema>>;

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
  extend: <
    NewType extends string,
    NewSchema extends BrandedZodObjectSchema,
    NewMethods extends BrandedMethodDefinitions = Record<never, never>,
  >(
    type: NewType,
    extendSchema: (baseSchema: Schema) => NewSchema,
    options?: {
      methods: NewMethods & ThisType<BrandedShapeEntity<NewType, NewSchema, Methods & NewMethods>>;
    }
  ) => BrandedShapeTuple<NewType, NewSchema, Methods & NewMethods>;
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
