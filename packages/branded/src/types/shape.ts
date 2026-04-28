import { z } from "zod";

import { __shapeMarker } from "../private-constants";
import { Branded, PatchDelta } from "./common";

/**
 * Structural row accepted as the first argument to shape **kit methods** (capabilities).
 * Uses schema output so extended shapes can pass instances whose row is a superset of the base.
 */
export type ShapeRow<Schema extends BrandedZodObjectSchema> = Readonly<z.output<Schema>> &
  ShapeMarked;

/**
 * Method bag for **`branded.capabilities`**: each function takes the entity as **`entity` (first arg)**,
 * then any additional arguments. Capabilities live on the **kit**, not on the instance prototype.
 *
 * Rest args and return use **`any`** so user methods keep precise parameter/return types under
 * inference (strict `unknown` rest breaks assignability to concrete args).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- intentional for kit method bag inference */
export type BrandedShapeMethods<Schema extends BrandedZodObjectSchema> = Record<
  string,
  (entity: ShapeRow<Schema>, ...args: any[]) => any
>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Composite domain type (object/entity): Zod output row + type-level brand + shape marker.
 * No instance methods — use **`UserKit.someMethod(user, …)`**.
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
 * Frozen entity instance: branded row + shape marker. Capabilities are on {@link BrandedShapeKit}.
 */
export type BrandedShapeEntity<
  Type extends string,
  Schema extends BrandedZodObjectSchema,
> = BrandedShape<Type, z.output<Schema>> & ShapeMarked;

/**
 * Always returns the **base** shape entity type so extra nominal narrowing (e.g. from proofs) is not
 * preserved in the type system after a patch (re-apply **`proof.parse`** when needed). Callers may still pass
 * a proof-marked instance as `entity`; only the return type is widened to the shape kit’s entity.
 */
export type BrandedShapePatchFn<Type extends string, Schema extends BrandedZodObjectSchema> = <
  T extends ShapeRow<Schema>,
>(
  entity: T,
  delta: PatchDelta<z.input<Schema>>
) => BrandedShapeEntity<Type, Schema>;

/** Core kit fields (exported for declaration emit when presets re-export shape kits). */
export interface BrandedShapeKitCore<Type extends string, Schema extends BrandedZodObjectSchema> {
  create: (input: z.input<Schema>) => BrandedShapeEntity<Type, Schema>;
  is: (value: unknown) => value is BrandedShapeEntity<Type, Schema>;
  extend: <NewType extends string, NewSchema extends BrandedZodObjectSchema>(
    type: NewType,
    extendConfig: (baseSchema: Schema) => { schema: NewSchema }
  ) => BrandedShapeKit<NewType, NewSchema, Record<never, never>>;
  schema: Schema;
  type: Type;
  project: ShapeProjectFn<Schema>;
}

/**
 * Kit from **`branded.shape`** (core only) or **`branded.capabilities`** (core + domain methods).
 */
export type BrandedShapeKit<
  Type extends string,
  Schema extends BrandedZodObjectSchema,
  Methods extends BrandedShapeMethods<Schema>,
> = BrandedShapeKitCore<Type, Schema> & Methods;

export type ShapeProjectFn<Schema extends BrandedZodObjectSchema> = <
  TargetType extends string,
  TargetSchema extends BrandedZodObjectSchema,
  TargetMethods extends BrandedShapeMethods<TargetSchema> = Record<never, never>,
>(
  entity: ShapeRow<Schema>,
  target: z.output<Schema> extends z.input<TargetSchema>
    ? BrandedShapeKit<TargetType, TargetSchema, TargetMethods>
    : never
) => ReturnType<BrandedShapeKit<TargetType, TargetSchema, TargetMethods>["create"]>;

/**
 * Generic patch surface exposed to reusable capabilities.
 * `Req` is the minimal structural contract required by a capability.
 */
export type BrandedCapabilityPatchFn<Req extends object> = <T extends Req>(
  entity: T,
  delta: PatchDelta<Req>
) => T;

/* eslint-disable @typescript-eslint/no-explicit-any -- capability methods keep user signatures */
export type BrandedCapabilityMethods<Req extends object> = Record<
  string,
  <T extends Req>(entity: T, ...args: any[]) => any
>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Reusable capability bundle that can be attached to compatible shapes. */
export interface BrandedCapability<
  Req extends object,
  Methods extends BrandedCapabilityMethods<Req>,
> {
  attach<
    Type extends string,
    Schema extends BrandedZodObjectSchema,
    BaseMethods extends BrandedShapeMethods<Schema> = Record<never, never>,
  >(
    shape: z.output<Schema> extends Req ? BrandedShapeKit<Type, Schema, BaseMethods> : never
  ): BrandedShapeKit<Type, Schema, BaseMethods & Methods>;
}

/** Fluent builder for reusable capability bundles. */
export interface BrandedCapabilitiesBuilder<Req extends object> {
  methods<const M extends BrandedCapabilityMethods<Req>>(
    factory: (patch: BrandedCapabilityPatchFn<Req>) => M
  ): BrandedCapability<Req, M>;
}
