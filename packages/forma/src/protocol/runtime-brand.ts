/**
 * Install an internal protocol brand without making it part of ordinary object
 * enumeration or spread. The default descriptor flags are deliberately all false.
 */
export function defineRuntimeBrand<T extends object, Brand>(
  target: T,
  brand: symbol,
  value: Brand
): T {
  Object.defineProperty(target, brand, { value });
  return target;
}

/**
 * Read a brand only from a frozen value carrying the descriptor shape emitted by
 * {@link defineRuntimeBrand}. Runtime brands establish protocol provenance, not
 * a security boundary: executable code can still reproduce a global symbol.
 */
export function readRuntimeBrand(value: unknown, brand: symbol): unknown {
  if (typeof value !== "object" || value === null || !Object.isFrozen(value)) {
    return undefined;
  }

  const descriptor = Object.getOwnPropertyDescriptor(value, brand);
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    descriptor.enumerable ||
    descriptor.configurable ||
    descriptor.writable
  ) {
    return undefined;
  }

  return descriptor.value;
}
