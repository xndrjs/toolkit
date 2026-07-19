/** Stable key for a lazy-loaded builder resource (namespace + locale or delivery area). */
export function formatBuilderResourceKey(namespace: string, partition: string): string {
  return `${namespace}\0${partition}`;
}

/** Serialized builder resource: namespace + partition (locale / delivery area). */
export type BuilderResourceEntry = readonly [namespace: string, partition: string];

/**
 * Dedup cache for lazy-loaded builder resources (`namespace` × partition).
 * A repeated `load()` for the same resource skips the loader (avoids re-fetch / re-merge).
 */
export class BuilderLoadRegistry {
  private readonly loaded = new Set<string>();

  has(namespace: string, partition: string): boolean {
    return this.loaded.has(formatBuilderResourceKey(namespace, partition));
  }

  mark(namespace: string, partition: string): void {
    this.loaded.add(formatBuilderResourceKey(namespace, partition));
  }

  /** Snapshot of loaded resources as `[namespace, partition]` tuples. */
  entries(): BuilderResourceEntry[] {
    const out: BuilderResourceEntry[] = [];
    for (const key of this.loaded) {
      const sep = key.indexOf("\0");
      out.push([key.slice(0, sep), key.slice(sep + 1)]);
    }
    return out;
  }

  seed(resources: readonly BuilderResourceEntry[]): void {
    for (const [namespace, partition] of resources) {
      this.mark(namespace, partition);
    }
  }
}
