import type { PatchDelta } from "./branded";
import { attachPatchImpl, getShapePatchImpl, type ShapeKit, type ShapeProps } from "./shape";

export type CapabilityPatchFn<Req extends object> = <T extends Req>(
  instance: T,
  delta: PatchDelta<Req>
) => T;

/* eslint-disable @typescript-eslint/no-explicit-any -- method bags mirror inference-friendly branded API */
export type CapabilityMethods<Req extends object> = Record<
  string,
  <T extends Req>(instance: T, ...args: any[]) => any
>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const RESERVED_KIT_KEYS = new Set(["create", "is", "safeCreate", "type", "validator", "project"]);

function validateCapabilityMethodKeys<Type extends string, Props extends object>(
  type: Type,
  methods: Record<string, (instance: Readonly<Props>, ...args: unknown[]) => unknown>,
  label: string
): void {
  for (const key of Object.keys(methods) as string[]) {
    if (RESERVED_KIT_KEYS.has(key)) {
      throw new TypeError(
        `Invalid method "${key}" for shape "${type}" ${label}: name is reserved for the shape kit`
      );
    }
    if (typeof methods[key as keyof typeof methods] !== "function") {
      throw new TypeError(
        `Invalid method "${key}" for shape "${type}" ${label}: expected a function`
      );
    }
  }
}

export interface CapabilityBundle<Req extends object, M extends CapabilityMethods<Req>> {
  /**
   * Attach only to a **schema-only** shape kit (`Record<never, never>` methods). Inference must not widen
   * this to `Record<string, Fn>` or plain `ShapeKit` stops being assignable (and `ZodShapeKit` fails attach).
   */
  attach<Type extends string, Input extends object, Props extends object>(
    shapeKit: Props extends Req ? ShapeKit<Type, Input, Props, Record<never, never>> : never
  ): ShapeKit<Type, Input, Props, M>;
}

export interface CapabilitiesBuilder<Req extends object> {
  methods<const M extends CapabilityMethods<Req>>(
    factory: (patch: CapabilityPatchFn<Req>) => M
  ): CapabilityBundle<Req, M>;
}

function defineCapability<Req extends object, const M extends CapabilityMethods<Req>>(
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
        methods as Record<string, (instance: Readonly<Props>, ...args: unknown[]) => unknown>,
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

      const kit = { ...shapeKit, ...boundMethods } as ShapeKit<Type, Input, Props, M>;
      attachPatchImpl(kit, shapePatch);
      return kit;
    },
  };
}

/**
 * Reusable capability bundle: **`capabilities<Props>().methods((patch) => ({ … })).attach(shape)`**.
 * Methods live on the kit; instances stay data-only. **`patch`** is validated by the shape’s input schema.
 */
export function capabilities<Props extends object>(): CapabilitiesBuilder<Props> {
  return {
    methods<const M extends CapabilityMethods<Props>>(
      factory: (patch: CapabilityPatchFn<Props>) => M
    ) {
      return defineCapability(factory);
    },
  };
}
