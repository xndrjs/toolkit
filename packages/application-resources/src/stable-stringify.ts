import type {
  ApplicationResourceKey,
  ApplicationResourceKeyObject,
  ApplicationResourceKeyPart,
} from "./types";

function stableKeyObject(part: ApplicationResourceKeyObject): ApplicationResourceKeyObject {
  const keys = Object.keys(part).sort();
  const sorted: ApplicationResourceKeyObject = {};
  for (const key of keys) {
    sorted[key] = part[key]!;
  }
  return sorted;
}

function stableKeyPart(part: ApplicationResourceKeyPart): ApplicationResourceKeyPart {
  if (part === null || typeof part !== "object") {
    return part;
  }

  return stableKeyObject(part);
}

function stableKey(key: ApplicationResourceKey): ApplicationResourceKeyPart[] {
  return key.map(stableKeyPart);
}

export function stableStringifyResource(type: string, key: ApplicationResourceKey): string {
  return `${JSON.stringify(type)}:${JSON.stringify(stableKey(key))}`;
}
