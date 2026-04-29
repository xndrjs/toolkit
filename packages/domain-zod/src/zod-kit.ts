import { domainCore, type PrimitiveKit, type ShapeKit } from "@xndrjs/domain";
import type { z } from "zod";

import { fromZod } from "./from-zod";

/**
 * Primitive kit built from a Zod schema: same as {@link primitive} + {@link fromZod}, plus `zodSchema` for composition (e.g. {@link brandedField}).
 */
export type ZodPrimitiveKit<
  Type extends string,
  Schema extends z.ZodTypeAny,
  Input = z.input<Schema>,
  Value = z.output<Schema>,
> = PrimitiveKit<Type, Input, Value> & { readonly zodSchema: Schema };

/**
 * Shape kit built from a Zod schema: same as {@link shape} + {@link fromZod}, plus `zodSchema` for composition.
 */
export type ZodShapeKit<
  Type extends string,
  Schema extends z.ZodTypeAny,
  Input extends object = z.input<Schema> extends object ? z.input<Schema> : never,
  Props extends object = z.output<Schema> extends object ? z.output<Schema> : never,
  Methods extends object = Record<never, never>,
> = ShapeKit<Type, Input, Props, Methods> & { readonly zodSchema: Schema };

export function primitiveFromZod<Type extends string, Schema extends z.ZodTypeAny>(
  type: Type,
  schema: Schema
): ZodPrimitiveKit<Type, Schema, z.input<Schema>, z.output<Schema>> {
  return Object.assign(domainCore.primitive(type, fromZod(schema)), { zodSchema: schema });
}

/** For object schemas only (`z.object({ ... })`); input/output types must be objects for {@link shape}. */
export function shapeFromZod<Type extends string, Schema extends z.ZodObject>(
  type: Type,
  schema: Schema
): ZodShapeKit<Type, Schema, z.input<Schema>, z.output<Schema>> {
  return Object.assign(domainCore.shape(type, fromZod(schema)), { zodSchema: schema });
}
