import { Anemic, AnemicOutput } from "./types";

function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Converts a branded domain value into a plain "anemic" structure:
 * - only own enumerable string keys are copied
 * - prototype methods are discarded
 * - symbol metadata (e.g. runtime brands) is discarded
 */
export function toAnemic<T>(value: T): Anemic<T> {
  if (Array.isArray(value)) {
    return value.map((entry) => toAnemic(entry)) as Anemic<T>;
  }

  if (isDate(value)) {
    return value as Anemic<T>;
  }

  if (isObject(value)) {
    const plain: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      plain[key] = toAnemic(value[key]);
    }
    return plain as Anemic<T>;
  }

  return value as Anemic<T>;
}

/**
 * Converts to anemic output and adds a compile-time nominal marker.
 * Useful to force explicit mapping in use-case return types.
 */
export function toAnemicOutput<T>(value: T): AnemicOutput<T> {
  return toAnemic(value) as AnemicOutput<T>;
}
