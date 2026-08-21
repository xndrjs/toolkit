import type { IslandId } from "./types";

/**
 * Direct edges between islands (dependencies ≠ membership).
 * Self-edges are ignored.
 */
export class IslandDependencyMap {
  private readonly dependencies = new Map<IslandId, Set<IslandId>>();

  add(islandId: IslandId, dependencyId: IslandId): void {
    if (islandId === dependencyId) {
      return;
    }

    const dependencies = this.dependencies.get(islandId) ?? new Set<IslandId>();

    dependencies.add(dependencyId);
    this.dependencies.set(islandId, dependencies);
  }

  get(islandId: IslandId): ReadonlySet<IslandId> {
    return this.dependencies.get(islandId) ?? new Set<IslandId>();
  }
}
