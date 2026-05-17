import type { Branded, PatchDelta } from "./branded";
import type { PrimitiveKit } from "./primitive";
import type { Scalar } from "./scalar";
import { attachPatchImpl, getShapePatchImpl, type ShapeKit, type ShapeProps } from "./shape";

export type CapabilityPatchFn<Req extends object> = <T extends Req>(
  instance: T,
  delta: PatchDelta<Req>
) => T;

/** Injected into primitive capability factories — materializes a new validated scalar. */
export type PrimitiveCapabilityCreateFn<
  Type extends string,
  Input extends Scalar,
  Value extends Scalar,
> = (input: Input) => Branded<Type, Value>;

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

const RESERVED_SHAPE_KIT_KEYS = new Set([
  "create",
  "is",
  "safeCreate",
  "type",
  "validator",
  "project",
]);

const RESERVED_PRIMITIVE_KIT_KEYS = new Set(["create", "is", "safeCreate", "type", "validator"]);

function validateCapabilityMethodKeys(
  type: string,
  methods: Record<string, (instance: unknown, ...args: unknown[]) => unknown>,
  label: string,
  reserved: ReadonlySet<string>
): void {
  for (const key of Object.keys(methods) as string[]) {
    if (reserved.has(key)) {
      throw new TypeError(
        `Invalid method "${key}" for kit "${type}" ${label}: name is reserved for the kit`
      );
    }
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
  ): ShapeKit<Type, Input, Props, M>;
}

export interface PrimitiveCapabilityBundle<
  Req extends Scalar,
  M extends PrimitiveCapabilityMethods<Req>,
> {
  attach<Type extends string, Input extends Scalar, Value extends Scalar>(
    primitiveKit: Value extends Req ? PrimitiveKit<Type, Input, Value, Record<never, never>> : never
  ): PrimitiveKit<Type, Input, Value, M>;
}

export interface ShapeCapabilitiesBuilder<Req extends object> {
  methods<const M extends CapabilityMethods<Req>>(
    factory: (patch: CapabilityPatchFn<Req>) => M
  ): CapabilityBundle<Req, M>;
}

export interface PrimitiveCapabilitiesBuilder<Req extends Scalar> {
  methods<const M extends PrimitiveCapabilityMethods<Req>>(
    factory: (create: (input: Req) => Req) => M
  ): PrimitiveCapabilityBundle<Req, M>;
}

function defineShapeCapability<Req extends object, const M extends CapabilityMethods<Req>>(
  factory: (patch: CapabilityPatchFn<Req>) => M
): CapabilityBundle<Req, M> {
  return {
    attach<Type extends string, Input extends object, Props extends object>(
      shapeKit: Props extends Req ? ShapeKit<Type, Input, Props, Record<never, never>> : never
    ): ShapeKit<Type, Input, Props, M> {
      const shapePatch = getShapePatchImpl(
        shapeKit as ShapeKit<Type, Input, Props, Record<never, never>>
      );
      const capabilityPatch: CapabilityPatchFn<Req> = <T extends Req>(
        instance: T,
        delta: PatchDelta<Req>
      ): T =>
        shapePatch(instance as ShapeProps<Type, Props>, delta as unknown as PatchDelta<Input>) as T;

      const methods = factory(capabilityPatch);
      validateCapabilityMethodKeys(
        shapeKit.type,
        methods as Record<string, (instance: unknown, ...args: unknown[]) => unknown>,
        "during capability attach",
        RESERVED_SHAPE_KIT_KEYS
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

      const kit = { ...shapeKit, ...boundMethods } as ShapeKit<Type, Input, Props, M>;
      attachPatchImpl(kit, shapePatch);
      return kit;
    },
  };
}

function definePrimitiveCapability<
  Req extends Scalar,
  const M extends PrimitiveCapabilityMethods<Req>,
>(factory: (create: (input: Req) => Req) => M): PrimitiveCapabilityBundle<Req, M> {
  return {
    attach<Type extends string, Input extends Scalar, Value extends Scalar>(
      primitiveKit: Value extends Req
        ? PrimitiveKit<Type, Input, Value, Record<never, never>>
        : never
    ): PrimitiveKit<Type, Input, Value, M> {
      const kit = primitiveKit as unknown as PrimitiveKit<Type, Input, Value, Record<never, never>>;
      const capabilityCreate = ((input: Req) =>
        kit.create(input as unknown as Input)) as unknown as (input: Req) => Req;

      const methods = factory(capabilityCreate);
      validateCapabilityMethodKeys(
        kit.type,
        methods as Record<string, (instance: unknown, ...args: unknown[]) => unknown>,
        "during capability attach",
        RESERVED_PRIMITIVE_KIT_KEYS
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

      return { ...kit, ...boundMethods } as PrimitiveKit<Type, Input, Value, M>;
    },
  };
}

/**
 * Capability builders for shapes (patch) and primitives (create).
 *
 * - **`capabilities.forShape<Contract>()`** — `methods((patch) => ({ … })).attach(shapeKit)`
 * - **`capabilities.forPrimitive<Contract>()`** — `methods((create) => ({ … })).attach(primitiveKit)`
 */
export const capabilities = {
  forShape<Req extends object>(): ShapeCapabilitiesBuilder<Req> {
    return {
      methods<const M extends CapabilityMethods<Req>>(
        factory: (patch: CapabilityPatchFn<Req>) => M
      ) {
        return defineShapeCapability(factory);
      },
    };
  },

  forPrimitive<Req extends Scalar>(): PrimitiveCapabilitiesBuilder<Req> {
    return {
      methods<const M extends PrimitiveCapabilityMethods<Req>>(
        factory: (create: (input: Req) => Req) => M
      ) {
        return definePrimitiveCapability(factory);
      },
    };
  },
};
