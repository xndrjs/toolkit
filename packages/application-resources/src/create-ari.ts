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

  let stringIdentity: string | undefined;
  const toStringIdentity = (): string =>
    (stringIdentity ??= stableStringifyResource(type, frozenKey));

  const resource: ApplicationResourceIdentifier<Type, Key> = {
    type,
    key: frozenKey,
    toArray() {
      return [type, ...frozenKey] as readonly [Type, ...Key];
    },
    toString: toStringIdentity,
    equals(other) {
      return toStringIdentity() === other.toString();
    },
  };

  return resource;
}
