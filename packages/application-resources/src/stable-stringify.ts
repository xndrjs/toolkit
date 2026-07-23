import type {
  ApplicationResourceKey,
  ApplicationResourceKeyPart,
  ApplicationResourcePrimitive,
} from "./types";

function stableStringifyPrimitive(value: ApplicationResourcePrimitive): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : JSON.stringify(value);
  }
  return JSON.stringify(value);
}

function stableStringifyKeyObject(part: Record<string, ApplicationResourcePrimitive>): string {
  const keys = Object.keys(part).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${stableStringifyPrimitive(part[key]!)}`
  );
  return `{${entries.join(",")}}`;
}

function stableStringifyKeyPart(part: ApplicationResourceKeyPart): string {
  if (part === null || typeof part !== "object") {
    return stableStringifyPrimitive(part);
  }

  return stableStringifyKeyObject(part);
}

function stableStringifyKey(key: ApplicationResourceKey): string {
  return `[${key.map(stableStringifyKeyPart).join(",")}]`;
}

export function stableStringifyResource(type: string, key: ApplicationResourceKey): string {
  return `${JSON.stringify(type)}:${stableStringifyKey(key)}`;
}
