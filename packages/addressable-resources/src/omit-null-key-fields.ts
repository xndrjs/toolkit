import type { AddressableResourceKey, AddressableResourcePrimitive } from "./types";

type OmitNullFields<O> = {
  [K in keyof O as [O[K]] extends [null] ? never : K]: Exclude<O[K], null>;
};

type OmitNullKeyFieldsResult<Parts extends readonly [string, AddressableResourceKey]> = readonly [
  Parts[0],
  OmitNullFields<Parts[1]>,
];

function omitNullFieldsFromKey(key: AddressableResourceKey): AddressableResourceKey {
  const next: Record<string, AddressableResourcePrimitive> = {};
  for (const [field, value] of Object.entries(key)) {
    if (value !== null) {
      next[field] = value;
    }
  }
  return Object.freeze(next);
}

/**
 * Returns a copy of an ARI array projection (`resource.toArray()`) with `null`
 * fields removed from the identity key object.
 *
 * Use this as an explicit projection (for example in an invalidation adapter).
 * Do not wrap resource factories with it — keep canonical ARIs including `null`.
 */
export function omitNullKeyFields<const Parts extends readonly [string, AddressableResourceKey]>(
  parts: Parts
): OmitNullKeyFieldsResult<Parts> {
  const [type, key] = parts;
  const projected = [type, omitNullFieldsFromKey(key)] as unknown as OmitNullKeyFieldsResult<Parts>;
  return Object.freeze(projected) as OmitNullKeyFieldsResult<Parts>;
}
