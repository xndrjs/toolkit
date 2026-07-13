/** Stable key for a lazy-loaded builder resource (namespace + locale or delivery area). */
export function formatBuilderResourceKey(namespace: string, partition: string | undefined): string {
  return `${namespace}\0${partition ?? ""}`;
}

export const SINGLE_BUILDER_RESOURCE = "__dictionary__";

export class BuilderLoadRegistry {
  private readonly loaded = new Set<string>();

  has(namespace: string, partition: string | undefined): boolean {
    return this.loaded.has(formatBuilderResourceKey(namespace, partition));
  }

  mark(namespace: string, partition: string | undefined): void {
    this.loaded.add(formatBuilderResourceKey(namespace, partition));
  }
}
