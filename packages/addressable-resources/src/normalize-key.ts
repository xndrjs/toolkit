import type { AddressableResourceKey } from "./types";

/** Clone and freeze a single identity key object. */
export function normalizeKey<Key extends AddressableResourceKey>(key: Key): Key {
  const normalized = { ...key };
  return Object.freeze(normalized) as Key;
}
