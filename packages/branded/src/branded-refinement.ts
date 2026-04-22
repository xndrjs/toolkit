import { BrandedRefinementError } from "./errors";
import { BrandedType, RefinementInstance, RefinementResult } from "./types";

type KitLike = { create: (input: never) => unknown } | { from: (value: never) => unknown };

function asObject(value: unknown): Record<PropertyKey, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<PropertyKey, unknown>)
    : null;
}

/** Frozen clone with the same prototype so shape `is` / methods still recognize the instance. */
function freezeRefinedClone<Brand extends string, NewType>(
  value: NewType
): RefinementResult<Brand, NewType> {
  const obj = asObject(value);
  if (!obj) {
    return value as RefinementResult<Brand, NewType>;
  }
  const currentPrototype = Object.getPrototypeOf(obj) as object | null;
  const clone = Object.assign(Object.create(currentPrototype), obj);
  return Object.freeze(clone) as RefinementResult<Brand, NewType>;
}

function defineRefinementForKit<
  Kit extends KitLike,
  NewType extends BrandedType<Kit>,
  Brand extends string,
>(brand: Brand, config: { is: (value: BrandedType<Kit>) => value is NewType }) {
  type BaseType = BrandedType<Kit>;

  function is<T extends BaseType>(value: T): value is RefinementInstance<T, Brand, NewType> {
    return config.is(value);
  }

  function from<T extends BaseType>(value: T): RefinementInstance<T, Brand, NewType> {
    if (!config.is(value)) {
      throw new BrandedRefinementError(brand);
    }
    return freezeRefinedClone<Brand, NewType>(value as unknown as NewType) as RefinementInstance<
      T,
      Brand,
      NewType
    >;
  }

  function tryFrom<T extends BaseType>(value: T): RefinementInstance<T, Brand, NewType> | null {
    if (!config.is(value)) {
      return null;
    }
    return freezeRefinedClone<Brand, NewType>(value as unknown as NewType) as RefinementInstance<
      T,
      Brand,
      NewType
    >;
  }

  return {
    brand,
    is,
    from,
    tryFrom,
  } as const;
}

function defineRefineWhenBuilder<Kit extends KitLike>(_kit: Kit) {
  return {
    when: <NewType extends BrandedType<Kit>>(
      is: (value: BrandedType<Kit>) => value is NewType
    ) => ({
      as: <Brand extends string>(brand: Brand) =>
        defineRefinementForKit<Kit, NewType, Brand>(brand, { is }),
    }),
  } as const;
}

/**
 * Start a refinement on a primitive or shape kit: `.when` (type predicate) then `.as` (brand name).
 * Narrowed data type is inferred from the `when` callback’s type guard.
 *
 * To chain existing refinement kits without re-stating `when`, use **`branded.refineChain`**.
 */
export function defineBrandedRefine<Kit extends KitLike>(_kit: Kit) {
  return defineRefineWhenBuilder(_kit);
}
