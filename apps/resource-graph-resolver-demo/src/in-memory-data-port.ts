import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";
import type { DataResolutionPort, ResourceKey } from "@xndrjs/resource-graph-resolver";

import type { DemoContentRegistry } from "./content-registry.js";

/**
 * Demo `DataResolutionPort`: looks up resources in a Map keyed by `format()`.
 * Missing keys are omitted (engine treats absence as unresolved).
 */
export function createInMemoryDataPort(
  store: ReadonlyMap<string, DemoContentRegistry[keyof DemoContentRegistry]>
): DataResolutionPort<DemoContentRegistry> {
  return {
    async resolve(
      resources: readonly ApplicationResourceIdentifier[]
    ): Promise<ReadonlyMap<ResourceKey, DemoContentRegistry[keyof DemoContentRegistry]>> {
      const result = new Map<ResourceKey, DemoContentRegistry[keyof DemoContentRegistry]>();

      for (const resource of resources) {
        const key = resource.format();
        if (store.has(key)) {
          result.set(key, store.get(key)!);
        }
      }

      return result;
    },
  };
}
