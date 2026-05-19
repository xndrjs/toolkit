import type { PatchDelta } from "./branded";
import type { PrimitiveKit } from "./primitive";
import type { Scalar } from "./scalar";
import { getShapePatchImpl, type ShapeKit, type ShapeProps } from "./shape";
import type { ValidationResult } from "./validation";

export type CapabilityPatchFn<Req extends object> = <T extends Req>(
  instance: T,
  delta: PatchDelta<Req>
) => T;

/** Helpers passed to shape capability factories at {@link CapabilityBundle.attach}. */
export interface ShapeCapabilityFactoryContext<Req extends object> {
  patch: CapabilityPatchFn<Req>;
  create: (input: Req) => Req;
  safeCreate: (input: Req) => ValidationResult<Req>;
  is: (value: unknown) => value is Req;
}

/** Helpers passed to primitive capability factories at {@link PrimitiveCapabilityBundle.attach}. */
export interface PrimitiveCapabilityFactoryContext<Req extends Scalar> {
  create: (input: Req) => Req;
  safeCreate: (input: Req) => ValidationResult<Req>;
  is: (value: unknown) => value is Req;
}

/** Capability kit returned by shape {@link CapabilityBundle.attach} — custom methods only. */
export type ShapeCapabilityKit<M extends CapabilityMethods<object>> = M;

/** Capability kit returned by primitive {@link PrimitiveCapabilityBundle.attach} — custom methods only. */
export type PrimitiveCapabilityKit<M extends PrimitiveCapabilityMethods<Scalar>> = M;

/* eslint-disable @typescript-eslint/no-explicit-any -- method bags mirror inference-friendly branded API */
export type CapabilityMethods<Req extends object> = Record<
  string,
  <T extends Req>(instance: T, ...args: any[]) => any
>;

export type PrimitiveCapabilityMethods<Req extends Scalar> = Record<
  string,
  <T extends Req>(instance: T, ...args: any[]) => any
>;
/* eslint-enable @typescript-eslint/no-explicit-any */

function validateCapabilityMethodKeys(
  type: string,
  methods: Record<string, (instance: unknown, ...args: unknown[]) => unknown>,
  label: string
): void {
  for (const key of Object.keys(methods) as string[]) {
    if (typeof methods[key as keyof typeof methods] !== "function") {
      throw new TypeError(
        `Invalid method "${key}" for kit "${type}" ${label}: expected a function`
      );
    }
  }
}

export interface CapabilityBundle<Req extends object, M extends CapabilityMethods<Req>> {
  attach<Type extends string, Input extends object, Props extends object>(
    shapeKit: Props extends Req ? ShapeKit<Type, Input, Props, Record<never, never>> : never
  ): ShapeCapabilityKit<M>;
}

export interface PrimitiveCapabilityBundle<
  Req extends Scalar,
  M extends PrimitiveCapabilityMethods<Req>,
> {
  attach<Type extends string, Input extends Scalar, Value extends Scalar>(
    primitiveKit: Value extends Req ? PrimitiveKit<Type, Input, Value, Record<never, never>> : never
  ): PrimitiveCapabilityKit<M>;
}

export interface ShapeCapabilitiesBuilder<Req extends object> {
  methods<const M extends CapabilityMethods<Req>>(
    factory: (ctx: ShapeCapabilityFactoryContext<Req>) => M
  ): CapabilityBundle<Req, M>;
}

export interface PrimitiveCapabilitiesBuilder<Req extends Scalar> {
  methods<const M extends PrimitiveCapabilityMethods<Req>>(
    factory: (ctx: PrimitiveCapabilityFactoryContext<Req>) => M
  ): PrimitiveCapabilityBundle<Req, M>;
}

function defineShapeCapability<Req extends object, const M extends CapabilityMethods<Req>>(
  factory: (ctx: ShapeCapabilityFactoryContext<Req>) => M
): CapabilityBundle<Req, M> {
  return {
    attach<Type extends string, Input extends object, Props extends object>(
      shapeKit: Props extends Req ? ShapeKit<Type, Input, Props, Record<never, never>> : never
    ): ShapeCapabilityKit<M> {
      const kit = shapeKit as ShapeKit<Type, Input, Props, Record<never, never>>;
      const shapePatch = getShapePatchImpl(kit);
      const capabilityPatch: CapabilityPatchFn<Req> = <T extends Req>(
        instance: T,
        delta: PatchDelta<Req>
      ): T =>
        shapePatch(instance as ShapeProps<Type, Props>, delta as unknown as PatchDelta<Input>) as T;

      const ctx: ShapeCapabilityFactoryContext<Req> = {
        patch: capabilityPatch,
        create: (input) => kit.create(input as unknown as Input) as Req,
        safeCreate: (input) => kit.safeCreate(input as unknown as Input) as ValidationResult<Req>,
        is: (value): value is Req => kit.is(value),
      };

      const methods = factory(ctx);
      validateCapabilityMethodKeys(
        kit.type,
        methods as Record<string, (instance: unknown, ...args: unknown[]) => unknown>,
        "during capability attach"
      );

      const boundMethods = {} as M;
      for (const key of Object.keys(methods) as (keyof M)[]) {
        const method = methods[key] as (instance: Readonly<Props>, ...args: unknown[]) => unknown;
        (boundMethods as Record<string, typeof method>)[key as string] = (
          instance: Readonly<Props>,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors capability method bag
          ...args: any[]
        ) => Reflect.apply(method, null, [instance, ...args]);
      }

      return boundMethods as ShapeCapabilityKit<M>;
    },
  };
}

function definePrimitiveCapability<
  Req extends Scalar,
  const M extends PrimitiveCapabilityMethods<Req>,
>(factory: (ctx: PrimitiveCapabilityFactoryContext<Req>) => M): PrimitiveCapabilityBundle<Req, M> {
  return {
    attach<Type extends string, Input extends Scalar, Value extends Scalar>(
      primitiveKit: Value extends Req
        ? PrimitiveKit<Type, Input, Value, Record<never, never>>
        : never
    ): PrimitiveCapabilityKit<M> {
      const kit = primitiveKit as unknown as PrimitiveKit<Type, Input, Value, Record<never, never>>;

      const ctx: PrimitiveCapabilityFactoryContext<Req> = {
        create: (input) => kit.create(input as unknown as Input) as unknown as Req,
        safeCreate: (input) => kit.safeCreate(input as unknown as Input) as ValidationResult<Req>,
        is: (value): value is Req => kit.is(value),
      };

      const methods = factory(ctx);
      validateCapabilityMethodKeys(
        kit.type,
        methods as Record<string, (instance: unknown, ...args: unknown[]) => unknown>,
        "during capability attach"
      );

      const boundMethods = {} as M;
      for (const key of Object.keys(methods) as (keyof M)[]) {
        const method = methods[key] as (instance: Req, ...args: unknown[]) => unknown;
        (boundMethods as Record<string, typeof method>)[key as string] = <T extends Req>(
          instance: T,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors capability method bag
          ...args: any[]
        ) => Reflect.apply(method, null, [instance, ...args]);
      }

      return boundMethods as PrimitiveCapabilityKit<M>;
    },
  };
}

/**
 * Capability builders for shapes and primitives.
 *
 * Schema kits (`shape`, `primitive`) expose `create`, `is`, `safeCreate`, and related helpers.
 * Capability kits returned by {@link CapabilityBundle.attach} / {@link PrimitiveCapabilityBundle.attach}
 * contain **only** custom methods from {@link ShapeCapabilitiesBuilder.methods} /
 * {@link PrimitiveCapabilitiesBuilder.methods}; factories receive schema helpers via destructuring.
 *
 * - **`capabilities.forShape<Contract>()`** — `methods(({ patch, create, … }) => ({ … })).attach(shapeKit)`
 * - **`capabilities.forPrimitive<Contract>()`** — `methods(({ create, … }) => ({ … })).attach(primitiveKit)`
 */
export const capabilities = {
  forShape<Req extends object>(): ShapeCapabilitiesBuilder<Req> {
    return {
      methods<const M extends CapabilityMethods<Req>>(
        factory: (ctx: ShapeCapabilityFactoryContext<Req>) => M
      ) {
        return defineShapeCapability(factory);
      },
    };
  },

  forPrimitive<Req extends Scalar>(): PrimitiveCapabilitiesBuilder<Req> {
    return {
      methods<const M extends PrimitiveCapabilityMethods<Req>>(
        factory: (ctx: PrimitiveCapabilityFactoryContext<Req>) => M
      ) {
        return definePrimitiveCapability(factory);
      },
    };
  },
};
