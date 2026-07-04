import type { MultiDictionary } from "./types.js";
import type { ValidationResult } from "./validation/types.js";
import { DictionaryValidationError } from "./validation/errors.js";

export interface EnsureNamespacesLoadedOptions<
  Schema extends MultiDictionary,
  NS extends keyof Schema & string,
> {
  provider: Pick<
    { hasNamespace(namespace: NS): boolean; setNamespace(namespace: NS, values: Schema[NS]): void },
    "hasNamespace" | "setNamespace"
  >;
  resolveLoader: (namespace: NS) => () => Promise<unknown>;
  validate: (namespace: NS, raw: unknown) => ValidationResult<Schema[NS]>;
}

const inFlightByProvider = new WeakMap<object, Map<string, Promise<void>>>();

async function ensureOneNamespace<Schema extends MultiDictionary, NS extends keyof Schema & string>(
  options: EnsureNamespacesLoadedOptions<Schema, NS>,
  namespace: NS
): Promise<void> {
  if (options.provider.hasNamespace(namespace)) {
    return;
  }

  const providerKey = options.provider as object;
  let inFlight = inFlightByProvider.get(providerKey);
  if (!inFlight) {
    inFlight = new Map();
    inFlightByProvider.set(providerKey, inFlight);
  }

  const existing = inFlight.get(namespace);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    try {
      if (options.provider.hasNamespace(namespace)) {
        return;
      }

      const raw = await options.resolveLoader(namespace)();
      const result = options.validate(namespace, raw);
      if (!result.ok) {
        throw new DictionaryValidationError(result.issues);
      }

      options.provider.setNamespace(namespace, result.data);
    } finally {
      inFlight!.delete(namespace);
    }
  })();

  inFlight.set(namespace, promise);
  return promise;
}

export async function ensureNamespacesLoadedImpl<
  Schema extends MultiDictionary,
  NS extends keyof Schema & string,
>(options: EnsureNamespacesLoadedOptions<Schema, NS>, namespaces: NS[]): Promise<void> {
  if (namespaces.length === 0) {
    return;
  }

  await Promise.all(namespaces.map((namespace) => ensureOneNamespace(options, namespace)));
}
