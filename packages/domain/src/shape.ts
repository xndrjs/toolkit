import type { Branded, Mutable, PatchDelta } from "./branded";
import { DomainValidationError } from "./errors";
import { __patchImpl, __shapeMarker } from "./private-constants";
import type { ValidationResult } from "./validation";
import type { Validator } from "./validation";

/** Type-level counterpart of runtime {@link __shapeMarker} on shape prototypes. */
export interface ShapeMarked {
  readonly [__shapeMarker]: true;
}

export type ShapeInstance<Type extends string, Props extends object> = Readonly<
  Branded<Type, Props>
> &
  ShapeMarked;

/** Structural row: validated props + shape marker (for capability method first args). */
export type ShapeProps<_Type extends string, Props extends object> = Readonly<Props> & ShapeMarked;

/** @internal — patch implementation; not part of the public kit surface. */
export type ShapePatchImpl<Type extends string, Props extends object, Input extends object> = <
  T extends ShapeProps<Type, Props>,
>(
  instance: T,
  delta: PatchDelta<Input>
) => ShapeInstance<Type, Props>;

function clonePropsForPatch<Props extends Record<string, unknown>>(row: Props): Props {
  return structuredClone(row);
}

function attachPatchImpl(kit: object, patch: unknown): void {
  Object.defineProperty(kit, __patchImpl, {
    value: patch,
    enumerable: false,
    writable: false,
    configurable: false,
  });
}

/**
 * Read internal patch from a shape kit (for `capabilities.attach` only).
 */
export function getShapePatchImpl<
  Type extends string,
  Input extends object,
  Props extends object,
  Methods extends Record<string, (instance: Readonly<Props>, ...args: unknown[]) => unknown>,
>(kit: ShapeKit<Type, Input, Props, Methods>): ShapePatchImpl<Type, Props, Input> {
  const patch = Reflect.get(kit as object, __patchImpl);
  if (typeof patch !== "function") {
    throw new TypeError(
      `Shape kit "${String(kit.type)}" has no patch (not a domain shape / capabilities kit)`
    );
  }
  return patch as ShapePatchImpl<Type, Props, Input>;
}

export interface ShapeKitCore<Type extends string, Input extends object, Props extends object> {
  readonly type: Type;
  readonly validator: Validator<Input, Props>;

  create(input: Input): ShapeInstance<Type, Props>;
  safeCreate(input: Input): ValidationResult<ShapeInstance<Type, Props>>;
  is(value: unknown): value is ShapeInstance<Type, Props>;

  project<TargetType extends string, TargetInput extends object, TargetProps extends object>(
    instance: ShapeProps<Type, Props>,
    target: ShapeKitCore<TargetType, TargetInput, TargetProps>
  ): ShapeInstance<TargetType, TargetProps>;
}

export type ShapeKit<
  Type extends string,
  Input extends object,
  Props extends object,
  Methods extends Record<string, (instance: Readonly<Props>, ...args: unknown[]) => unknown>,
> = ShapeKitCore<Type, Input, Props> & Methods;

/**
 * Trusted object boundary: validate with {@link Validator}, freeze instances, nominal shape brand.
 * Patch is stored only under {@link __patchImpl} (non-enumerable); use capabilities to expose updates.
 */
export function shape<Type extends string, Input extends object, Props extends object>(
  type: Type,
  validator: Validator<Input, Props>
): ShapeKit<Type, Input, Props, Record<never, never>> {
  const prototype = Object.create(null) as Record<string, unknown>;

  Object.defineProperty(prototype, __shapeMarker, {
    enumerable: false,
    configurable: false,
    writable: false,
    value: true,
  });

  function createInstance(
    parsed: Props,
    instancePrototype: object | null = prototype
  ): ShapeInstance<Type, Props> {
    const entity = Object.assign(Object.create(instancePrototype), parsed) as Record<
      string | symbol,
      unknown
    >;
    return Object.freeze(entity) as ShapeInstance<Type, Props>;
  }

  function create(input: Input): ShapeInstance<Type, Props> {
    const result = validator.validate(input);
    if (!result.success) {
      throw new DomainValidationError(
        `Invalid input for shape "${type}" during create`,
        result.error
      );
    }
    return createInstance(result.data);
  }

  function safeCreate(input: Input): ValidationResult<ShapeInstance<Type, Props>> {
    const result = validator.validate(input);
    if (!result.success) {
      return result;
    }
    return { success: true, data: createInstance(result.data) };
  }

  function patch<T extends ShapeProps<Type, Props>>(
    instance: T,
    delta: PatchDelta<Input>
  ): ShapeInstance<Type, Props> {
    const draft = clonePropsForPatch({
      ...(instance as unknown as Record<string, unknown>),
    }) as Mutable<ShapeInstance<Type, Props>>;

    if (typeof delta === "function") {
      delta(draft as unknown as Mutable<Input>);
    } else {
      Object.assign(draft, delta);
    }

    const validated = validator.validate(draft as unknown as Input);
    if (!validated.success) {
      throw new DomainValidationError(
        `Invalid input for shape "${type}" during patch`,
        validated.error
      );
    }

    return createInstance(validated.data, Object.getPrototypeOf(instance));
  }

  function is(value: unknown): value is ShapeInstance<Type, Props> {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    if (Object.getPrototypeOf(value) !== prototype) {
      return false;
    }
    const payload = { ...(value as Record<string, unknown>) };
    return validator.validate(payload as Input).success;
  }

  function project<
    TargetType extends string,
    TargetInput extends object,
    TargetProps extends object,
  >(
    instance: ShapeProps<Type, Props>,
    target: ShapeKitCore<TargetType, TargetInput, TargetProps>
  ): ShapeInstance<TargetType, TargetProps> {
    return target.create({
      ...(instance as unknown as Record<string, unknown>),
    } as TargetInput) as ShapeInstance<TargetType, TargetProps>;
  }

  const kitCore = {
    create,
    safeCreate,
    is,
    type,
    validator,
    project,
  };

  const kit = kitCore as ShapeKit<Type, Input, Props, Record<never, never>>;
  attachPatchImpl(kit, patch);
  return kit;
}
