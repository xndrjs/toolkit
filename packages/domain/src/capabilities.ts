import type { Branded, PatchDelta } from "./branded";
import type { PrimitiveKit } from "./primitive";
import type { Scalar } from "./scalar";
import { getShapePatchImpl, type ShapeInstance, type ShapeKit, type ShapeProps } from "./shape";
import type { ValidationResult } from "./validation";

export type CapabilityPatchFn<Req extends object> = <T extends Req>(
  instance: T,
  delta: PatchDelta<Req>
) => T;

/**
 * Normalize a shape capability contract generic to raw props.
 * Unwraps outer {@link ShapeInstance} / {@link ShapeProps} only — nested field brands stay intact.
 */
export type CapabilityShapeContract<Req extends object> =
  Req extends ShapeInstance<string, infer Props extends object>
    ? Props
    : Req extends ShapeProps<string, infer Props extends object>
      ? Props
      : Req;

/**
 * Normalize a primitive capability contract generic to the underlying scalar.
 * Unwraps outer {@link Branded} only.
 */
export type CapabilityPrimitiveContract<Req extends Scalar> =
  Req extends Branded<string, infer Value extends Scalar> ? Value : Req;

/** Diagnostic when a shape kit's Props do not satisfy the capability contract. */
export type ShapeAttachMismatchError<Req extends object, Props extends object> = {
  readonly __capabilityAttachError: "Kit Props do not satisfy Contract";
  readonly contract: Req;
  readonly props: Props;
};

/** Diagnostic when a primitive kit's Value does not satisfy the capability contract. */
export type PrimitiveAttachMismatchError<Req extends Scalar, Value extends Scalar> = {
  readonly __capabilityAttachError: "Kit Value does not satisfy Contract";
  readonly contract: Req;
  readonly value: Value;
};

/** Helpers passed to shape capability factories at attach / kit-path bind time. */
export interface ShapeCapabilityFactoryContext<Req extends object> {
  patch: CapabilityPatchFn<Req>;
  create: (input: Req) => Req;
  safeCreate: (input: Req) => ValidationResult<Req>;
  is: (value: unknown) => value is Req;
}

/** Helpers passed to primitive capability factories at attach / kit-path bind time. */
export interface PrimitiveCapabilityFactoryContext<Req extends Scalar> {
  create: (input: Req) => Req;
  safeCreate: (input: Req) => ValidationResult<Req>;
  is: (value: unknown) => value is Req;
}

/** Capability kit returned by shape attach / kit-path `.methods` — custom methods only. */
export type ShapeCapabilityKit<M extends CapabilityMethods<object>> = M;

/** Capability kit returned by primitive attach / kit-path `.methods` — custom methods only. */
export type PrimitiveCapabilityKit<M extends PrimitiveCapabilityMethods<Scalar>> = M;

/* eslint-disable @typescript-eslint/no-explicit-any -- method bags mirror inference-friendly capability API */
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
    shapeKit: [Props] extends [Req]
      ? ShapeKit<Type, Input, Props, Record<never, never>>
      : ShapeAttachMismatchError<Req, Props>
  ): ShapeCapabilityKit<M>;
}

export interface PrimitiveCapabilityBundle<
  Req extends Scalar,
  M extends PrimitiveCapabilityMethods<Req>,
> {
  attach<Type extends string, Input extends Scalar, Value extends Scalar>(
    primitiveKit: [Value] extends [Req]
      ? PrimitiveKit<Type, Input, Value, Record<never, never>>
      : PrimitiveAttachMismatchError<Req, Value>
  ): PrimitiveCapabilityKit<M>;
}

/** Contract-path builder: `.methods` returns a bundle that still needs `.attach`. */
export interface ShapeCapabilitiesBuilder<Req extends object> {
  methods<const M extends CapabilityMethods<Req>>(
    factory: (ctx: ShapeCapabilityFactoryContext<Req>) => M
  ): CapabilityBundle<Req, M>;
}

/** Contract-path builder: `.methods` returns a bundle that still needs `.attach`. */
export interface PrimitiveCapabilitiesBuilder<Req extends Scalar> {
  methods<const M extends PrimitiveCapabilityMethods<Req>>(
    factory: (ctx: PrimitiveCapabilityFactoryContext<Req>) => M
  ): PrimitiveCapabilityBundle<Req, M>;
}

/** Kit-path builder: `.methods` returns the capability kit directly (attach baked in). */
export interface ShapeKitCapabilitiesBuilder<Props extends object> {
  methods<const M extends CapabilityMethods<Props>>(
    factory: (ctx: ShapeCapabilityFactoryContext<Props>) => M
  ): ShapeCapabilityKit<M>;
}

/** Kit-path builder: `.methods` returns the capability kit directly (attach baked in). */
export interface PrimitiveKitCapabilitiesBuilder<Value extends Scalar> {
  methods<const M extends PrimitiveCapabilityMethods<Value>>(
    factory: (ctx: PrimitiveCapabilityFactoryContext<Value>) => M
  ): PrimitiveCapabilityKit<M>;
}

function bindShapeCapability<
  Req extends object,
  Type extends string,
  Input extends object,
  Props extends object,
  const M extends CapabilityMethods<Req>,
>(
  factory: (ctx: ShapeCapabilityFactoryContext<Req>) => M,
  kit: ShapeKit<Type, Input, Props, Record<never, never>>
): ShapeCapabilityKit<M> {
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
}

function bindPrimitiveCapability<
  Req extends Scalar,
  Type extends string,
  Input extends Scalar,
  Value extends Scalar,
  const M extends PrimitiveCapabilityMethods<Req>,
>(
  factory: (ctx: PrimitiveCapabilityFactoryContext<Req>) => M,
  kit: PrimitiveKit<Type, Input, Value, Record<never, never>>
): PrimitiveCapabilityKit<M> {
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
}

function defineShapeCapability<Req extends object, const M extends CapabilityMethods<Req>>(
  factory: (ctx: ShapeCapabilityFactoryContext<Req>) => M
): CapabilityBundle<Req, M> {
  return {
    attach<Type extends string, Input extends object, Props extends object>(
      shapeKit: [Props] extends [Req]
        ? ShapeKit<Type, Input, Props, Record<never, never>>
        : ShapeAttachMismatchError<Req, Props>
    ): ShapeCapabilityKit<M> {
      return bindShapeCapability(
        factory,
        shapeKit as ShapeKit<Type, Input, Props, Record<never, never>>
      );
    },
  };
}

function definePrimitiveCapability<
  Req extends Scalar,
  const M extends PrimitiveCapabilityMethods<Req>,
>(factory: (ctx: PrimitiveCapabilityFactoryContext<Req>) => M): PrimitiveCapabilityBundle<Req, M> {
  return {
    attach<Type extends string, Input extends Scalar, Value extends Scalar>(
      primitiveKit: [Value] extends [Req]
        ? PrimitiveKit<Type, Input, Value, Record<never, never>>
        : PrimitiveAttachMismatchError<Req, Value>
    ): PrimitiveCapabilityKit<M> {
      return bindPrimitiveCapability(
        factory,
        primitiveKit as PrimitiveKit<Type, Input, Value, Record<never, never>>
      );
    },
  };
}

/**
 * Capability builders for shapes and primitives.
 *
 * Schema kits (`shape`, `primitive`) expose `create`, `is`, `safeCreate`, and related helpers.
 * Capability kits contain **only** custom methods; factories receive schema helpers via destructuring.
 *
 * - **`capabilities.forShapeKit(shapeKit)`** — infer props from kit; `.methods` returns the capability kit
 * - **`capabilities.forShapeContract<Contract>()`** — explicit contract; `.methods(…).attach(shapeKit)`
 * - **`capabilities.forPrimitiveKit(primitiveKit)`** — infer value from kit; `.methods` returns the capability kit
 * - **`capabilities.forPrimitiveContract<Contract>()`** — explicit contract; `.methods(…).attach(primitiveKit)`
 */
export const capabilities = {
  forShapeKit<Type extends string, Input extends object, Props extends object>(
    shapeKit: ShapeKit<Type, Input, Props, Record<never, never>>
  ): ShapeKitCapabilitiesBuilder<Props> {
    return {
      methods<const M extends CapabilityMethods<Props>>(
        factory: (ctx: ShapeCapabilityFactoryContext<Props>) => M
      ): ShapeCapabilityKit<M> {
        return bindShapeCapability(factory, shapeKit);
      },
    };
  },

  forShapeContract<Req extends object>(): ShapeCapabilitiesBuilder<CapabilityShapeContract<Req>> {
    return {
      methods<const M extends CapabilityMethods<CapabilityShapeContract<Req>>>(
        factory: (ctx: ShapeCapabilityFactoryContext<CapabilityShapeContract<Req>>) => M
      ) {
        return defineShapeCapability(factory);
      },
    };
  },

  forPrimitiveKit<Type extends string, Input extends Scalar, Value extends Scalar>(
    primitiveKit: PrimitiveKit<Type, Input, Value, Record<never, never>>
  ): PrimitiveKitCapabilitiesBuilder<Value> {
    return {
      methods<const M extends PrimitiveCapabilityMethods<Value>>(
        factory: (ctx: PrimitiveCapabilityFactoryContext<Value>) => M
      ): PrimitiveCapabilityKit<M> {
        return bindPrimitiveCapability(factory, primitiveKit);
      },
    };
  },

  forPrimitiveContract<Req extends Scalar>(): PrimitiveCapabilitiesBuilder<
    CapabilityPrimitiveContract<Req>
  > {
    return {
      methods<const M extends PrimitiveCapabilityMethods<CapabilityPrimitiveContract<Req>>>(
        factory: (ctx: PrimitiveCapabilityFactoryContext<CapabilityPrimitiveContract<Req>>) => M
      ) {
        return definePrimitiveCapability(factory);
      },
    };
  },
};
