import { normalizeKey } from "./normalize-key";
import { stableStringifyResource } from "./stable-stringify";
import type {
  ApplicationResourceIdentifier,
  ApplicationResourceKey,
  AssertValidApplicationResourceKey,
} from "./types";

/** Internal: builds an ARI instance without key-schema validation. */
export function createAri<const Type extends string, const Key extends ApplicationResourceKey>(
  type: Type,
  ...keyParts: Key & AssertValidApplicationResourceKey<Key>
): ApplicationResourceIdentifier<Type, Key> {
  const frozenKey = normalizeKey(keyParts);

  const resource: ApplicationResourceIdentifier<Type, Key> = {
    type,
    key: frozenKey,
    toArray() {
      return [type, ...frozenKey] as readonly [Type, ...Key];
    },
    toString() {
      return stableStringifyResource(type, frozenKey);
    },
    equals(other) {
      return (
        stableStringifyResource(type, frozenKey) === stableStringifyResource(other.type, other.key)
      );
    },
  };

  return resource;
}
