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

    const islandDependencies = this.dependencies.get(islandId) ?? new Set<IslandId>();

    islandDependencies.add(dependencyId);
    this.dependencies.set(islandId, islandDependencies);
  }

  get(islandId: IslandId): ReadonlySet<IslandId> {
    return this.dependencies.get(islandId) ?? new Set<IslandId>();
  }

  /** Snapshot of all direct island dependency edges. */
  get dependencyMap(): ReadonlyMap<IslandId, ReadonlySet<IslandId>> {
    return new Map(
      [...this.dependencies.entries()].map(([islandId, deps]) => [islandId, new Set(deps)])
    );
  }

  /** Transitive dependency island ids reachable from `islandId`, deduplicated and sorted. */
  getFlatDependencies(islandId: IslandId): readonly IslandId[] {
    const seen = new Set<IslandId>();

    const walk = (currentIslandId: IslandId): void => {
      for (const dependencyId of this.get(currentIslandId)) {
        if (seen.has(dependencyId)) {
          continue;
        }
        seen.add(dependencyId);
        walk(dependencyId);
      }
    };

    walk(islandId);
    return [...seen].sort();
  }
}
