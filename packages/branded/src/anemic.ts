import { __shapeMarker } from "./private-constants";
import { Anemic, AnemicOutput } from "./types";

function isShapeMarked(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Reflect.has(value, __shapeMarker);
}

/**
 * Converts **shape** values into plain "anemic" structures (drops methods / symbol keys on the row).
 * Plain objects, host objects, and other non-shape values pass through by reference.
 * Arrays are mapped element-wise.
 */
export function toAnemic<T>(value: T): Anemic<T> {
  if (Array.isArray(value)) {
    return value.map((entry) => toAnemic(entry)) as Anemic<T>;
  }

  if (isShapeMarked(value)) {
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
