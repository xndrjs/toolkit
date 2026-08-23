import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { IslandId, ResourceKey } from "./types";

/**
 * Per-island membership of resource keys.
 * Also acts as the visited set for `(islandId, resource)` pairs during traversal.
 */
export class IslandMap {
  private readonly islands = new Map<IslandId, Set<ResourceKey>>();

  has(islandId: IslandId, resource: ApplicationResourceIdentifier): boolean {
    return this.islands.get(islandId)?.has(resource.toString()) ?? false;
  }

  add(islandId: IslandId, resource: ApplicationResourceIdentifier): void {
    const resources = this.islands.get(islandId) ?? new Set<ResourceKey>();

    resources.add(resource.toString());
    this.islands.set(islandId, resources);
  }

  get(islandId: IslandId): ReadonlySet<ResourceKey> {
    return this.islands.get(islandId) ?? new Set<ResourceKey>();
  }

  islandIds(): readonly IslandId[] {
    return [...this.islands.keys()];
  }
}
