import { z } from "zod";
import { BrandedValidationError } from "./errors";
import { __shapeMarker } from "./private-constants";
import {
  BrandedMethodDefinitions,
  BrandedShapeEntity,
  BrandedShapeKit,
  BrandedShapeTuple,
  BrandedZodObjectSchema,
  Mutable,
  PatchDelta,
} from "./types";

/** Deep-clones enumerable own props so nested mutations in `patch` never alias the frozen entity. */
function cloneRowForPatch<Row extends Record<string, unknown>>(row: Row): Row {
  return structuredClone(row);
}

export function defineBrandedShape<
  Schema extends BrandedZodObjectSchema,
  Type extends string,
  Methods extends BrandedMethodDefinitions = Record<never, never>,
>(
  type: Type,
  config: {
    schema: Schema;
    methods: Methods & ThisType<BrandedShapeEntity<Type, Schema, Methods>>;
  }
): BrandedShapeTuple<Type, Schema, Methods> {
  type InputProps = z.input<Schema>;
  type OutputProps = z.output<Schema>;
  type Entity = BrandedShapeEntity<Type, Schema, Methods>;
  const { schema, methods } = config;
  const prototype = Object.create(null) as Record<string, unknown>;

  for (const key of Object.keys(methods) as (keyof Methods)[]) {
    const method = methods[key];
    if (key === "project") {
      throw new TypeError(
        `Invalid method "${String(key)}" for shape "${type}": "${String(key)}" is reserved`
      );
    }
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

  Object.defineProperty(prototype, __shapeMarker, {
    enumerable: false,
    configurable: false,
    writable: false,
    value: true,
  });

  Object.defineProperty(prototype, "project", {
    enumerable: false,
    configurable: false,
    writable: false,
    value: function projectInvoker(
      this: Entity,
      target: BrandedShapeKit<string, BrandedZodObjectSchema, BrandedMethodDefinitions>
    ) {
      return target.create({ ...(this as unknown as Record<string, unknown>) });
    },
  });

  function createEntity(parsed: OutputProps, entityPrototype: object | null = prototype): Entity {
    const entity = Object.assign(Object.create(entityPrototype), parsed) as Record<
      string | symbol,
      unknown
    >;
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
    return createEntity(parsedResult.data);
  }

  function patch<T extends Entity>(entity: T, delta: PatchDelta<InputProps>): Entity {
    const draft = cloneRowForPatch({
      ...(entity as unknown as Record<string, unknown>),
    }) as Mutable<Entity>;

    if (typeof delta === "function") {
      delta(draft as unknown as Mutable<InputProps>);
    } else {
      Object.assign(draft, delta);
    }

    const validatedResult = schema.safeParse(draft);
    if (!validatedResult.success) {
      throw new BrandedValidationError(
        `Invalid input for shape "${type}" during patch`,
        validatedResult.error
      );
    }
    const validated = validatedResult.data;

    return createEntity(validated, Object.getPrototypeOf(entity));
  }

  function is(value: unknown): value is Entity {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    if (Object.getPrototypeOf(value) !== prototype) {
      return false;
    }
    const payload = { ...(value as Record<string, unknown>) };
    return schema.safeParse(payload).success;
  }

  function extend<
    NewType extends string,
    NewSchema extends BrandedZodObjectSchema,
    NewMethods extends BrandedMethodDefinitions = Record<never, never>,
  >(
    nextType: NewType,
    extendConfig: (
      baseSchema: Schema,
      baseMethods: Methods
    ) => {
      schema: NewSchema;
      methods?:
        | (NewMethods & ThisType<BrandedShapeEntity<NewType, NewSchema, NewMethods>>)
        | ((baseMethods: Methods) => NewMethods);
    }
  ): BrandedShapeTuple<NewType, NewSchema, NewMethods> {
    const nextConfig = extendConfig(schema, methods);
    const methodsOption = nextConfig.methods;
    const additionalMethods =
      typeof methodsOption === "function"
        ? methodsOption(methods)
        : ((methodsOption ?? {}) as NewMethods);
    const methodNameCollisions = (Object.keys(additionalMethods) as string[]).filter(
      (key) => key === "project"
    );
    if (methodNameCollisions.length > 0) {
      throw new TypeError(
        `Cannot extend shape "${type}" into "${nextType}": method(s) already defined: ${methodNameCollisions.join(", ")}`
      );
    }
    return defineBrandedShape<NewSchema, NewType, NewMethods>(nextType, {
      schema: nextConfig.schema,
      methods: additionalMethods as NewMethods &
        ThisType<BrandedShapeEntity<NewType, NewSchema, NewMethods>>,
    });
  }

  const kit: BrandedShapeKit<Type, Schema, Methods> = {
    create,
    is,
    extend,
    schema,
    type,
  };

  return [kit, patch];
}
