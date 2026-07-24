import type {
  ApplicationResourceKey,
  ApplicationResourceKeyObject,
  ApplicationResourceKeyPart,
  ApplicationResourcePrimitive,
} from "./types";

type OmitNullFields<O> = {
  [K in keyof O as [O[K]] extends [null] ? never : K]: Exclude<O[K], null>;
};

type OmitNullFieldsFromPart<Part> = Part extends ApplicationResourcePrimitive
  ? Part
  : Part extends ApplicationResourceKeyObject
    ? OmitNullFields<Part>
    : Part;

type OmitNullKeyFieldsResult<Parts extends readonly unknown[]> = {
  readonly [Index in keyof Parts]: OmitNullFieldsFromPart<Parts[Index]>;
};

function omitNullFieldsFromPart(part: ApplicationResourceKeyPart): ApplicationResourceKeyPart {
  if (part === null || typeof part !== "object") {
    return part;
  }

  const next: Record<string, ApplicationResourcePrimitive> = {};
  for (const [key, value] of Object.entries(part)) {
    if (value !== null) {
      next[key] = value;
    }
  }
  return Object.freeze(next);
}

/**
 * Returns a copy of an ARI array projection (`resource.toArray()`) with `null`
 * fields removed from object key parts. Primitive parts are left unchanged.
 *
 * Use this as an explicit projection (for example in an invalidation adapter).
 * Do not wrap resource factories with it — keep canonical ARIs including `null`.
 */
export function omitNullKeyFields<const Parts extends readonly [string, ...ApplicationResourceKey]>(
  parts: Parts
): OmitNullKeyFieldsResult<Parts> {
  const [type, ...key] = parts;
  const projected = [type, ...key.map(omitNullFieldsFromPart)] as OmitNullKeyFieldsResult<Parts>;
  return Object.freeze(projected) as OmitNullKeyFieldsResult<Parts>;
}
