import { formatAriString } from "./format-ari-string";
import { normalizeKey } from "./normalize-key";
import type {
  AddressableResourceIdentifier,
  AddressableResourceKey,
  AssertValidAddressableResourceKey,
} from "./types";

/** Internal: builds an ARI instance without key-schema validation. */
export function createAri<const Type extends string, const Key extends AddressableResourceKey>(
  type: Type,
  key: Key & AssertValidAddressableResourceKey<Key>
): AddressableResourceIdentifier<Type, Key> {
  const frozenKey = normalizeKey(key);

  let stringIdentity: string | undefined;
  const toStringIdentity = (): string => (stringIdentity ??= formatAriString(type, frozenKey));

  const resource: AddressableResourceIdentifier<Type, Key> = {
    type,
    key: frozenKey,
    toArray() {
      return [type, frozenKey] as const;
    },
    toString: toStringIdentity,
    equals(other) {
      return toStringIdentity() === other.toString();
    },
  };

  return resource;
}
