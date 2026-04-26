import { z } from "zod";
import { BrandedValidationError } from "./errors";
import { __shapeMarker, __shapePatch } from "./private-constants";
import {
  BrandedShapeEntity,
  BrandedShapeKit,
  BrandedShapeMethods,
  BrandedShapePatchFn,
  BrandedZodObjectSchema,
  Mutable,
  PatchDelta,
  ShapeRow,
} from "./types";

/** Deep-clones enumerable own props so nested mutations in `patch` never alias the frozen entity. */
function cloneRowForPatch<Row extends Record<string, unknown>>(row: Row): Row {
  return structuredClone(row);
}

function attachShapePatch(kit: object, patch: unknown): void {
  Object.defineProperty(kit, __shapePatch, {
    value: patch,
    enumerable: false,
    writable: false,
    configurable: false,
  });
}

function getBrandedShapePatch<
  Type extends string,
  Schema extends BrandedZodObjectSchema,
  Methods extends BrandedShapeMethods<Schema>,
>(kit: BrandedShapeKit<Type, Schema, Methods>): BrandedShapePatchFn<Type, Schema> {
  const patch = Reflect.get(kit as object, __shapePatch);
  if (typeof patch !== "function") {
    throw new TypeError(
      `Shape kit "${String(kit.type)}" has no internal patch (not a branded.shape / branded.capabilities kit)`
    );
  }
  return patch as BrandedShapePatchFn<Type, Schema>;
}

const RESERVED_KIT_KEYS = new Set(["create", "is", "extend", "schema", "type", "project"]);

function validateMethodKeys<Type extends string, Schema extends BrandedZodObjectSchema>(
  type: Type,
  methods: BrandedShapeMethods<Schema>,
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

/**
 * Schema-only shape kit. **`patch`** is stored internally under **`__shapePatch`** (non-enumerable).
 * Add capabilities with **`branded.capabilities(kit, (patch) => ({ … }))`**.
 */
export function defineBrandedShape<Type extends string, Schema extends BrandedZodObjectSchema>(
  type: Type,
  schema: Schema
): BrandedShapeKit<Type, Schema, Record<never, never>> {
  type InputProps = z.input<Schema>;
  type OutputProps = z.output<Schema>;
  type Entity = BrandedShapeEntity<Type, Schema>;

  const prototype = Object.create(null) as Record<string, unknown>;

  Object.defineProperty(prototype, __shapeMarker, {
    enumerable: false,
    configurable: false,
    writable: false,
    value: true,
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

  function patch<T extends ShapeRow<Schema>>(entity: T, delta: PatchDelta<InputProps>): Entity {
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

  function project<
    TargetType extends string,
    TargetSchema extends BrandedZodObjectSchema,
    TargetMethods extends BrandedShapeMethods<TargetSchema>,
  >(
    entity: ShapeRow<Schema>,
    target: BrandedShapeKit<TargetType, TargetSchema, TargetMethods>
  ): ReturnType<BrandedShapeKit<TargetType, TargetSchema, TargetMethods>["create"]> {
    return target.create({
      ...(entity as unknown as Record<string, unknown>),
    } as z.input<TargetSchema>) as ReturnType<
      BrandedShapeKit<TargetType, TargetSchema, TargetMethods>["create"]
    >;
  }

  function extend<NewType extends string, NewSchema extends BrandedZodObjectSchema>(
    nextType: NewType,
    extendConfig: (baseSchema: Schema) => { schema: NewSchema }
  ): BrandedShapeKit<NewType, NewSchema, Record<never, never>> {
    const nextSchema = extendConfig(schema).schema;
    return defineBrandedShape(nextType, nextSchema);
  }

  const kitCore = {
    create,
    is,
    extend,
    schema,
    type,
    project,
  };

  const kit = kitCore as BrandedShapeKit<Type, Schema, Record<never, never>>;
  attachShapePatch(kit, patch);
  return kit;
}

/**
 * Attach capability methods. **`patch`** is the same function stored on **`shape`** under **`__shapePatch`**.
 * First argument of each method should be **`ShapeRow<typeof schema>`** (or implicit) so it matches the kit contract.
 */
export function defineBrandedShapeCapabilities<
  Type extends string,
  Schema extends BrandedZodObjectSchema,
  const M extends BrandedShapeMethods<Schema>,
>(
  shape: BrandedShapeKit<Type, Schema, Record<never, never>>,
  factory: (patch: BrandedShapePatchFn<Type, Schema>) => M
): BrandedShapeKit<Type, Schema, M> {
  const patch = getBrandedShapePatch(shape);
  const methods = factory(patch);
  validateMethodKeys(shape.type, methods, "during capabilities");

  const boundMethods = {} as M;
  for (const key of Object.keys(methods) as (keyof M)[]) {
    const method = methods[key] as (entity: ShapeRow<Schema>, ...args: unknown[]) => unknown;
    (boundMethods as Record<string, typeof method>)[key as string] = (
      entity: ShapeRow<Schema>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors BrandedShapeMethods rest
      ...args: any[]
    ) => Reflect.apply(method, null, [entity, ...args]);
  }

  const kit = { ...shape, ...boundMethods } as BrandedShapeKit<Type, Schema, M>;
  attachShapePatch(kit, patch);
  return kit;
}
