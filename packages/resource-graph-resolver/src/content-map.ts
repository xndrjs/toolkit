import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { ResourceKey } from "./types";

/**
 * Global, per-execution store of resolved resource values.
 * Each {@link ResourceKey} appears at most once; islands may share the same key.
 */
export class ContentMap {
  private readonly resources = new Map<ResourceKey, unknown>();

  has(resource: ApplicationResourceIdentifier): boolean {
    return this.resources.has(resource.format());
  }

  hasKey(resourceKey: ResourceKey): boolean {
    return this.resources.has(resourceKey);
  }

  get<T>(resource: ApplicationResourceIdentifier): T | undefined {
    return this.resources.get(resource.format()) as T | undefined;
  }

  getByKey<T>(resourceKey: ResourceKey): T | undefined {
    return this.resources.get(resourceKey) as T | undefined;
  }

  set(resource: ApplicationResourceIdentifier, value: unknown): void {
    this.resources.set(resource.format(), value);
  }
}
