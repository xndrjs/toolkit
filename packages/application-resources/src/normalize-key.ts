import type { ApplicationResourceKey } from "./types";

function cloneKeyPart<Part extends ApplicationResourceKey[number]>(part: Part): Part {
  if (part !== null && typeof part === "object") {
    return { ...part };
  }

  return part;
}

export function normalizeKey<Key extends ApplicationResourceKey>(key: Key): Key {
  const normalized = key.map((part) => cloneKeyPart(part));

  for (const part of normalized) {
    if (part !== null && typeof part === "object") {
      Object.freeze(part);
    }
  }

  return Object.freeze(normalized) as Key;
}
