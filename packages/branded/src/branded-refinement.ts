import { __brand } from "./private-constants";
import { BrandedRefinementError } from "./errors";
import { BrandOf, BrandState, BrandedType, RefinementResult } from "./types";

interface KitLike {
  create: (input: never) => unknown;
}

function asObject(value: unknown): Record<PropertyKey, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<PropertyKey, unknown>)
    : null;
}

function withBrand<Brand extends string, NewType>(
  value: NewType,
  brand: Brand
): RefinementResult<Brand, NewType> {
  const obj = asObject(value);
  if (!obj) {
    return value as RefinementResult<Brand, NewType>;
  }

  const currentBrandState = obj[__brand];
  const prevState =
    typeof currentBrandState === "object" && currentBrandState !== null
      ? (currentBrandState as BrandState)
      : {};

  const clone = { ...obj };
  clone[__brand] = Object.freeze({
    ...prevState,
    [brand]: true,
  });

  return Object.freeze(clone) as RefinementResult<Brand, NewType>;
}

export function defineBrandedRefinement<
  Kit extends KitLike,
  NewType extends BrandedType<Kit>,
  Brand extends string = BrandOf<NewType>,
>(brand: Brand, config: { is: (value: BrandedType<Kit>) => value is NewType }) {
  type BaseType = BrandedType<Kit>;
  type ResultType = RefinementResult<Brand, NewType>;

  function is(value: BaseType): value is ResultType {
    return config.is(value);
  }

  function from(value: BaseType): ResultType {
    if (!is(value)) {
      throw new BrandedRefinementError(brand);
    }
    return withBrand(value as NewType, brand) as ResultType;
  }

  function tryFrom(value: BaseType): ResultType | null {
    if (!is(value)) {
      return null;
    }
    return withBrand(value as NewType, brand) as ResultType;
  }

  return {
    brand,
    is,
    from,
    tryFrom,
  } as const;
}
