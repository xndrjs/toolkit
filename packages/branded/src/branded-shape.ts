import { z } from "zod";
import { __brand } from "./private-constants";
import { BrandedValidationError } from "./errors";
import {
  BrandedMethodDefinitions,
  BrandedShapeEntity,
  BrandedShapeKit,
  BrandedShapeTuple,
  BrandedZodObjectSchema,
  BrandState,
  Mutable,
  PatchDelta,
} from "./types";

export function defineBrandedShape<
  Schema extends BrandedZodObjectSchema,
  Type extends string,
  Methods extends BrandedMethodDefinitions = Record<never, never>,
>(
  type: Type,
  schema: Schema,
  options?: {
    methods?: Methods & ThisType<BrandedShapeEntity<Type, Schema, Methods>>;
  }
): BrandedShapeTuple<Type, Schema, Methods> {
  type InputProps = z.input<Schema>;
  type OutputProps = z.output<Schema>;
  type Entity = BrandedShapeEntity<Type, Schema, Methods>;
  const shapeBrandState = Object.freeze({ [type]: true });
  const methods = options?.methods ?? ({} as Methods);
  const prototype = Object.create(null) as Record<string, unknown>;

  for (const key of Object.keys(methods) as (keyof Methods)[]) {
    const method = methods[key];
    if (typeof method !== "function") {
      throw new TypeError(
        `Invalid method "${String(key)}" for shape "${type}": expected a function`
      );
    }
    Object.defineProperty(prototype, key, {
      enumerable: false,
      configurable: false,
      writable: false,
      value: function methodInvoker(this: Entity, ...args: unknown[]) {
        return Reflect.apply(method, this, args);
      },
    });
  }

  function createEntity(
    parsed: OutputProps,
    brandState: BrandState,
    entityPrototype: object | null = prototype
  ): Entity {
    const entity = Object.assign(Object.create(entityPrototype), parsed) as Record<
      string | symbol,
      unknown
    >;
    Object.defineProperty(entity, "type", {
      value: type,
      enumerable: true,
      configurable: false,
      writable: false,
    });
    Object.defineProperty(entity, __brand, {
      value: brandState,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    return Object.freeze(entity) as Entity;
  }

  function create(input: InputProps): Entity {
    const parsedResult = schema.safeParse(input);
    if (!parsedResult.success) {
      throw new BrandedValidationError(
        `Invalid input for shape "${type}" during create`,
        parsedResult.error
      );
    }
    return createEntity(parsedResult.data, shapeBrandState);
  }

  function payloadForSchemaParse(draft: Mutable<Entity>): Record<string, unknown> {
    const copy = { ...draft } as Record<string | typeof __brand, unknown>;
    delete copy.type;
    Reflect.deleteProperty(copy, __brand);
    return copy;
  }

  function patch<T extends Entity>(entity: T, delta: PatchDelta<InputProps>): T {
    const draft = { ...entity } as Mutable<Entity>;

    if (typeof delta === "function") {
      delta(draft as unknown as Mutable<InputProps>);
    } else {
      Object.assign(draft, delta);
    }

    const validatedResult = schema.safeParse(payloadForSchemaParse(draft));
    if (!validatedResult.success) {
      throw new BrandedValidationError(
        `Invalid input for shape "${type}" during patch`,
        validatedResult.error
      );
    }
    const validated = validatedResult.data;

    return createEntity(validated, entity[__brand], Object.getPrototypeOf(entity)) as T;
  }

  function is(value: unknown): value is Entity {
    const brandState = (value as Partial<Record<typeof __brand, unknown>>)[__brand];
    return (
      typeof value === "object" &&
      value !== null &&
      "type" in value &&
      (value as { type?: unknown }).type === type &&
      __brand in value &&
      typeof brandState === "object" &&
      brandState !== null &&
      (brandState as BrandState)[type] === true
    );
  }

  const kit: BrandedShapeKit<Type, Schema, Methods> = {
    create,
    is,
    schema,
    type,
  };

  return [kit, patch];
}
