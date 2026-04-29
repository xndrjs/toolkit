import type { PatchDelta } from "./branded";
import type { ShapeKit } from "./shape";

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

export interface CapabilityBundle<Req extends object, M extends CapabilityMethods<Req>> {
  attach<
    Type extends string,
    Input extends object,
    Props extends object,
    /* eslint-disable @typescript-eslint/no-explicit-any -- method bag inference matches shape kit */
    BaseMethods extends Record<string, (instance: Readonly<Props>, ...args: any[]) => any> = Record<
      never,
      never
    >,
    /* eslint-enable @typescript-eslint/no-explicit-any */
  >(
    shapeKit: Props extends Req ? ShapeKit<Type, Input, Props, BaseMethods> : never
  ): ShapeKit<Type, Input, Props, BaseMethods & M>;
}

export interface CapabilitiesBuilder<Req extends object> {
  methods<const M extends CapabilityMethods<Req>>(
    factory: (patch: CapabilityPatchFn<Req>) => M
  ): CapabilityBundle<Req, M>;
}

/**
 * Builds reusable capability bundles. Runtime implementation follows in the next milestone.
 */
export function capabilities<Req extends object>(): CapabilitiesBuilder<Req> {
  throw new Error("@xndrjs/domain: `capabilities` is not implemented yet");
}
