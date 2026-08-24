import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import { ContentMap } from "../model/content-map";
import { ResolveContentGraphAbortedError } from "../errors";
import type { ExpansionContext, ExpansionPort } from "../ports/expansion-port";
import { IslandDependencyMap } from "../model/island-dependency-map";
import { IslandMap } from "../model/island-map";
import type {
  ContentRegistry,
  IslandId,
  ResolutionError,
  ResolveContentGraphInput,
  ResolveContentGraphOutput,
  ResolvedResourceRecord,
  ResourceKey,
} from "../types";

/** One walk step: a resource discovered in a specific island context. */
export interface GraphWalkRef {
  resource: ApplicationResourceIdentifier;
  inheritedIslandId: IslandId;
}

interface FailureAccumulator {
  resourceKey: ResourceKey;
  message: string;
  inheritedIslandIds: Set<IslandId>;
}

interface PendingEntry {
  resource: ApplicationResourceIdentifier;
  inheritedIslandIds: Set<IslandId>;
}

const sortedCopy = <T extends string>(values: Iterable<T>): T[] => [...values].sort();

/**
 * Shared graph-resolution state for walk schedulers.
 *
 * Owns ContentMap, island membership/dependencies, missing-resource errors,
 * backing promotion, expansion, abort checks, and global queued/in-flight keys.
 * Schedulers decide when to load; this session guarantees one pending entry per
 * ARI while retaining every waiting `inheritedIslandId`.
 */
export class GraphResolutionSession<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  readonly contentMap = new ContentMap<R>();
  readonly islands = new IslandMap();
  readonly islandDependencies = new IslandDependencyMap();

  private readonly failuresByResource = new Map<ResourceKey, FailureAccumulator>();
  private readonly queuedByKey = new Map<ResourceKey, PendingEntry>();
  private readonly inFlightByKey = new Map<ResourceKey, PendingEntry>();

  constructor(
    private readonly input: ResolveContentGraphInput<TExecutionContext>,
    private readonly expansionPort: ExpansionPort<R, TExecutionContext>
  ) {}

  get signal(): AbortSignal | undefined {
    return this.input.signal;
  }

  assertNotAborted(): void {
    const signal = this.input.signal;
    if (signal?.aborted) {
      throw new ResolveContentGraphAbortedError("Content graph resolution was aborted", {
        cause: signal.reason,
      });
    }
  }

  isUnresolved(resource: ApplicationResourceIdentifier): boolean {
    const key = resource.toString();
    return !this.contentMap.has(resource) && !this.failuresByResource.has(key);
  }

  hasFailure(resource: ApplicationResourceIdentifier): boolean {
    return this.failuresByResource.has(resource.toString());
  }

  isQueued(resource: ApplicationResourceIdentifier): boolean {
    return this.queuedByKey.has(resource.toString());
  }

  isInFlight(resource: ApplicationResourceIdentifier): boolean {
    return this.inFlightByKey.has(resource.toString());
  }

  isPending(resource: ApplicationResourceIdentifier): boolean {
    return this.isQueued(resource) || this.isInFlight(resource);
  }

  inheritedIslandIdsFor(resource: ApplicationResourceIdentifier): readonly IslandId[] {
    const key = resource.toString();
    const entry = this.inFlightByKey.get(key) ?? this.queuedByKey.get(key);
    if (entry === undefined) {
      return [];
    }

    return [...entry.inheritedIslandIds];
  }

  /**
   * Records `inheritedIslandId` as a waiter for `resource`.
   *
   * @returns `true` when this is the first queued occurrence (scheduler should
   * arrange a load). `false` when the ARI is already queued, in-flight, resolved,
   * or failed — do not load again; waiters are still retained for later expansion
   * or missing-resource aggregation.
   */
  rememberWaiter(ref: GraphWalkRef): boolean {
    const key = ref.resource.toString();

    if (this.contentMap.has(ref.resource)) {
      return false;
    }

    const failure = this.failuresByResource.get(key);
    if (failure !== undefined) {
      failure.inheritedIslandIds.add(ref.inheritedIslandId);
      return false;
    }

    const inFlight = this.inFlightByKey.get(key);
    if (inFlight !== undefined) {
      inFlight.inheritedIslandIds.add(ref.inheritedIslandId);
      return false;
    }

    const queued = this.queuedByKey.get(key);
    if (queued !== undefined) {
      queued.inheritedIslandIds.add(ref.inheritedIslandId);
      return false;
    }

    this.queuedByKey.set(key, {
      resource: ref.resource,
      inheritedIslandIds: new Set([ref.inheritedIslandId]),
    });
    return true;
  }

  /** Moves a queued key into the in-flight set, preserving waiters. */
  markInFlight(resource: ApplicationResourceIdentifier): void {
    const key = resource.toString();
    const queued = this.queuedByKey.get(key);
    if (queued !== undefined) {
      this.queuedByKey.delete(key);
      this.inFlightByKey.set(key, queued);
      return;
    }

    if (!this.inFlightByKey.has(key)) {
      this.inFlightByKey.set(key, {
        resource,
        inheritedIslandIds: new Set(),
      });
    }
  }

  /**
   * Clears queued/in-flight tracking for `resource`.
   *
   * @returns waiters recorded while the key was pending.
   */
  settle(resource: ApplicationResourceIdentifier): readonly IslandId[] {
    const key = resource.toString();
    const entry = this.inFlightByKey.get(key) ?? this.queuedByKey.get(key);
    this.inFlightByKey.delete(key);
    this.queuedByKey.delete(key);
    return entry === undefined ? [] : [...entry.inheritedIslandIds];
  }

  promoteBackingHits(refs: readonly GraphWalkRef[]): void {
    const backingResources = this.input.backingResources;
    if (backingResources === undefined || backingResources.size === 0) {
      return;
    }

    for (const item of refs) {
      if (!this.isUnresolved(item.resource)) {
        continue;
      }

      const key = item.resource.toString();
      if (!backingResources.has(key)) {
        continue;
      }

      this.contentMap.set(
        item.resource as ApplicationResourceIdentifier<keyof R & string>,
        backingResources.get(key) as R[keyof R & string]
      );
      backingResources.delete(key);
      this.settle(item.resource);
    }
  }

  commitRecords(
    records: readonly ResolvedResourceRecord<R>[]
  ): Map<ResourceKey, ResolvedResourceRecord<R>> {
    const resolvedByKey = new Map<ResourceKey, ResolvedResourceRecord<R>>();
    for (const record of records) {
      resolvedByKey.set(record.resource.toString(), record);
      this.contentMap.set(record.resource, record.payload);
    }

    return resolvedByKey;
  }

  /**
   * A taken resource was omitted from the port result.
   * Throw mode fails immediately; collect mode registers later via {@link registerMissing}.
   */
  throwIfMissingTaken(ref: GraphWalkRef): void {
    if (this.input.missingResourceMode === "throw") {
      throw new Error(`Unable to resolve ${ref.resource.toString()}`);
    }
  }

  registerMissing(ref: GraphWalkRef): void {
    const resourceKey = ref.resource.toString();

    const failure = this.failuresByResource.get(resourceKey) ?? {
      resourceKey,
      message: `Unable to resolve ${resourceKey}`,
      inheritedIslandIds: new Set<IslandId>(),
    };

    failure.inheritedIslandIds.add(ref.inheritedIslandId);
    this.failuresByResource.set(resourceKey, failure);
    this.settle(ref.resource);
  }

  /**
   * Port accepted nothing while unresolved work remains.
   * Not the same as deferral after a non-empty take.
   */
  failUnhandledIfEmptyTake(refs: readonly GraphWalkRef[]): void {
    const unhandled = refs.filter((item) => this.isUnresolved(item.resource));
    if (unhandled.length === 0) {
      return;
    }

    if (this.input.missingResourceMode === "throw") {
      throw new Error(`Unable to resolve ${unhandled[0]!.resource.toString()}`);
    }

    for (const item of unhandled) {
      this.registerMissing(item);
    }
  }

  expand(ref: GraphWalkRef): GraphWalkRef[] {
    const resourceKey = ref.resource.toString();

    const expansion = this.expansionPort.expand({
      resource: ref.resource,
      payload: this.contentMap.getByKey(resourceKey)!,
      inheritedIslandId: ref.inheritedIslandId,
      executionContext: this.input.executionContext,
    } as ExpansionContext<R, TExecutionContext>);

    const islandId = expansion.isIsland ? resourceKey : ref.inheritedIslandId;

    if (islandId !== ref.inheritedIslandId) {
      this.islandDependencies.add(ref.inheritedIslandId, islandId);
    }

    if (this.islands.has(islandId, ref.resource)) {
      return [];
    }

    this.islands.add(islandId, ref.resource);

    const children: GraphWalkRef[] = [];
    for (const child of expansion.resources) {
      const childRef: GraphWalkRef = {
        resource: child,
        inheritedIslandId: islandId,
      };
      this.rememberWaiter(childRef);
      children.push(childRef);
    }

    return children;
  }

  toOutput(): ResolveContentGraphOutput<R> {
    const errors: ResolutionError[] = [...this.failuresByResource.values()]
      .map((failure) => ({
        resourceKey: failure.resourceKey,
        message: failure.message,
        inheritedIslandIds: sortedCopy(failure.inheritedIslandIds),
      }))
      .sort((left, right) => left.resourceKey.localeCompare(right.resourceKey));

    return {
      contentMap: this.contentMap,
      islands: this.islands,
      islandDependencies: this.islandDependencies,
      errors,
    };
  }
}
