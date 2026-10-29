/**
 * Surface / `using` key hygiene: string keys only; reject lifecycle collisions
 * and prototype-pollution names (`__proto__`).
 */

/**
 * Aliases that must not appear on `compose({ surface })` (collide with context lifecycle).
 * Design C may later reserve `surface` when nesting aliases under `execution.surface`.
 */
export const RESERVED_SURFACE_ALIASES = ["dispose"] as const;

export type ReservedSurfaceAlias = (typeof RESERVED_SURFACE_ALIASES)[number];

const RESERVED_SURFACE_SET = new Set<string>(RESERVED_SURFACE_ALIASES);

/** True when `key` is reserved for ExecutionContext lifecycle. */
export function isReservedSurfaceAlias(key: string): key is ReservedSurfaceAlias {
  return RESERVED_SURFACE_SET.has(key);
}

/**
 * Fail if `record` has non-string own keys, `__proto__`, or (when opted in) reserved surface aliases.
 * Uses `Reflect.ownKeys` so symbol keys are visible (unlike `Object.keys`).
 */
export function assertStringRecordKeys(
  record: object,
  label: string,
  options?: { readonly rejectReservedSurface?: boolean }
): void {
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== "string") {
      throw new Error(`${label} keys must be strings; got ${typeof key}`);
    }
    if (key === "__proto__") {
      throw new Error(`${label} key "__proto__" is not allowed`);
    }
    if (options?.rejectReservedSurface && isReservedSurfaceAlias(key)) {
      throw new Error(`Surface alias "${key}" is reserved for execution-context lifecycle`);
    }
  }
}

/** Copy own string properties onto a null-prototype object (no inherited keys). */
export function sealedStringRecord<T extends object>(record: T): T {
  return Object.assign(Object.create(null), record) as T;
}
