import type { AddressableResourceKey, AddressableResourcePrimitive } from "./types";

/** Type names must not contain parentheses (parse delimiters). */
export function assertValidAriType(type: string): void {
  if (type.includes("(") || type.includes(")")) {
    throw new Error(`Invalid ARI type ${JSON.stringify(type)}: must not contain '(' or ')'`);
  }
}

function formatScalar(value: AddressableResourcePrimitive): string {
  return JSON.stringify(value);
}

/**
 * Canonical ARI identity string: `Type(field=value,field=value,...)`.
 *
 * Field order is lexicographic. Scalar values use JSON rules (`"str"`, `42`, `true`, `null`).
 */
export function formatAriString(type: string, key: AddressableResourceKey): string {
  assertValidAriType(type);

  const fields = Object.keys(key).sort();
  const body = fields.map((field) => `${field}=${formatScalar(key[field]!)}`).join(",");
  return `${type}(${body})`;
}
