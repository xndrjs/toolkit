import { __anemicOutput } from "../private-constants";
import { ShapeMarked } from "./shape";

type AnyFunction = (...args: never[]) => unknown;

/**
 * "Anemic" view of a domain value:
 * - only **shape** values (see {@link ShapeMarked} / runtime `__shapeMarker`) are expanded:
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
