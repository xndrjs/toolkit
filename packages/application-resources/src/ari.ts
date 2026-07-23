import { normalizeKey } from "./normalize-key";
import { stableStringifyResource } from "./stable-stringify";
import type {
  ApplicationResourceIdentifier,
  ApplicationResourceKey,
  ApplicationResourceKeyFormatter,
  AssertValidApplicationResourceKey,
} from "./types";

const defaultFormatter: ApplicationResourceKeyFormatter = (resource) =>
  stableStringifyResource(resource.type, resource.key);

export function ari<const Type extends string, const Key extends ApplicationResourceKey>(
  type: Type,
  key: Key & AssertValidApplicationResourceKey<Key>
): ApplicationResourceIdentifier<Type, Key> {
  const frozenKey = normalizeKey(key);

  const resource: ApplicationResourceIdentifier<Type, Key> = {
    type,
    key: frozenKey,
    toArray() {
      return [type, ...frozenKey] as readonly [Type, ...Key];
    },
    format(formatter) {
      return (formatter ?? defaultFormatter)(resource);
    },
    equals(other) {
      return (
        stableStringifyResource(type, frozenKey) === stableStringifyResource(other.type, other.key)
      );
    },
  };

  return resource;
}
