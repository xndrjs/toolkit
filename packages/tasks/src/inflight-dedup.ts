import type { InflightRegistry } from "./inflight-registry";

export function getOrCreateInflight<T>(
  store: InflightRegistry,
  key: symbol,
  run: () => Promise<T>
): Promise<T> {
  const existing = store.get(key);
  if (existing) {
    return existing as Promise<T>;
  }
  const created = run().finally(() => {
    if (store.get(key) === created) {
      store.delete(key);
    }
  }) as Promise<T>;
  store.set(key, created);
  return created;
}
