import type { z } from "zod";

import { Branded } from "./common";
import type { BrandedProofKit } from "./proof";

/** Return type of a kit’s `create` or `from` method (handles generic call signatures). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- conditional inference only
type KitFnReturn<F> = F extends (...args: any) => infer R ? R : never;

/**
 * Value type produced by a kit:
 * - primitive / shape: return type of **`create`**
 * - proof: **`Branded<brand, Out>`** where **`Out`** is the kit’s narrowed output (including **`refineType`**)
 *
 * @example
 * type Email = BrandedType<typeof EmailPrimitive>;
 * type User = BrandedType<typeof UserShape>;
 * type PositiveInt = BrandedType<typeof PositiveIntProof>;
 */
export type BrandedType<
  Kit extends { create: (...args: never) => unknown } | { parse: (...args: never) => unknown },
> = Kit extends { parse: (...args: never) => unknown }
  ? Kit extends { create: (...args: never) => unknown }
    ? KitFnReturn<Kit["create"]>
    : Kit extends BrandedProofKit<infer B, z.ZodType, infer Out>
      ? Branded<B, Out>
      : Kit extends { brand: infer B extends string; schema: infer S extends z.ZodType }
        ? Branded<B, z.output<S>>
        : never
  : Kit extends { create: infer Create }
    ? KitFnReturn<Create>
    : never;
