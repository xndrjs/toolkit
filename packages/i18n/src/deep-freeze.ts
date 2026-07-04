export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
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
