export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  // Guards against infinite recursion on cyclic structures.
  if (Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return value;
}

export function cloneAndFreeze<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}
