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

  /**
   * Transitive dependency island ids reachable from `islandId`, deduplicated and sorted.
   * The starting island is never included, even when dependency cycles point back to it.
   */
  getFlatDependencies(islandId: IslandId): readonly IslandId[] {
    const seen = new Set<IslandId>();
    const stack: IslandId[] = [...this.get(islandId)];

    while (stack.length > 0) {
      const dependencyId = stack.pop()!;
      if (dependencyId === islandId || seen.has(dependencyId)) {
        continue;
      }

      seen.add(dependencyId);
      for (const next of this.get(dependencyId)) {
        stack.push(next);
      }
    }

    return [...seen].sort();
  }
}
