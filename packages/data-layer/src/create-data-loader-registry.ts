import type DataLoader from "dataloader";

export interface DataLoaderRegistry {
  getOrCreate<K, V>(key: string, factory: () => DataLoader<K, V>): DataLoader<K, V>;
}

export function createDataLoaderRegistry(): DataLoaderRegistry {
  const map = new Map<string, DataLoader<unknown, unknown>>();

  return {
    getOrCreate<K, V>(key: string, factory: () => DataLoader<K, V>): DataLoader<K, V> {
      const cached = map.get(key);
      if (cached !== undefined) {
        return cached as DataLoader<K, V>;
      }
      const loader = factory();
      map.set(key, loader as DataLoader<unknown, unknown>);
      return loader;
    },
  };
}
