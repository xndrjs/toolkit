import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { ContentRegistry, ResourceKey } from "../types";

/**
 * Global, per-execution store of resolved resource values.
 * Each {@link ResourceKey} appears at most once; islands may share the same key.
 *
 * Parameterize with a project {@link ContentRegistry} so `get`/`set` follow `ari.type`.
 */
export class ContentMap<R extends ContentRegistry = ContentRegistry> {
  private readonly resources = new Map<ResourceKey, unknown>();

  has(resource: ApplicationResourceIdentifier): boolean {
    return this.resources.has(resource.toString());
  }

  hasKey(resourceKey: ResourceKey): boolean {
    return this.resources.has(resourceKey);
  }

  get<T extends keyof R & string>(resource: ApplicationResourceIdentifier<T>): R[T] | undefined {
    return this.resources.get(resource.toString()) as R[T] | undefined;
  }

  /** Opaque key lookup — prefer {@link get} when an ARI is available. */
  getByKey(resourceKey: ResourceKey): R[keyof R] | undefined {
    return this.resources.get(resourceKey) as R[keyof R] | undefined;
  }

  set<T extends keyof R & string>(resource: ApplicationResourceIdentifier<T>, value: R[T]): void {
    this.resources.set(resource.toString(), value);
  }
}
