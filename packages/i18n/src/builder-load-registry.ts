import type { I18nLoadState, I18nResourceLoadRecord } from "./load-state.js";

/** Stable key for a lazy-loaded builder resource (namespace + locale or delivery area). */
export function formatBuilderResourceKey(namespace: string, partition: string): string {
  return `${namespace}\0${partition}`;
}

/** Serialized builder resource: namespace + partition (locale / delivery area). */
export type BuilderResourceEntry = readonly [namespace: string, partition: string];

/**
 * Dedup cache for lazy-loaded builder resources (`namespace` × partition).
 * Tracks pending / loaded / error for {@link I18nLoadState}.
 */
export class BuilderLoadRegistry {
  private readonly states = new Map<string, I18nResourceLoadRecord>();

  has(namespace: string, partition: string): boolean {
    return this.states.get(formatBuilderResourceKey(namespace, partition))?.status === "loaded";
  }

  markPending(namespace: string, partition: string): void {
    this.setState(namespace, partition, { status: "pending" });
  }

  mark(namespace: string, partition: string): void {
    this.markLoaded(namespace, partition);
  }

  markLoaded(namespace: string, partition: string): void {
    this.setState(namespace, partition, { status: "loaded" });
  }

  markError(namespace: string, partition: string, error: unknown): void {
    this.setState(namespace, partition, { status: "error", error });
  }

  /** Snapshot of loaded resources as `[namespace, partition]` tuples. */
  entries(): BuilderResourceEntry[] {
    const out: BuilderResourceEntry[] = [];
    for (const record of this.states.values()) {
      if (record.status === "loaded") {
        out.push([record.namespace, record.partition]);
      }
    }
    return out;
  }

  seed(resources: readonly BuilderResourceEntry[]): void {
    for (const [namespace, partition] of resources) {
      this.markLoaded(namespace, partition);
    }
  }

  getLoadState(): I18nLoadState {
    const resources = [...this.states.values()].sort((a, b) => {
      const byNamespace = a.namespace.localeCompare(b.namespace);
      return byNamespace !== 0 ? byNamespace : a.partition.localeCompare(b.partition);
    });
    return { resources };
  }

  private setState(
    namespace: string,
    partition: string,
    patch: Pick<I18nResourceLoadRecord, "status"> & Partial<Pick<I18nResourceLoadRecord, "error">>
  ): void {
    const record: I18nResourceLoadRecord = {
      namespace,
      partition,
      status: patch.status,
    };
    if (patch.error !== undefined) {
      record.error = patch.error;
    }
    this.states.set(formatBuilderResourceKey(namespace, partition), record);
  }
}
