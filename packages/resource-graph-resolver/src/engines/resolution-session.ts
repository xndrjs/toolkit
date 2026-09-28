import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import { ContentMap } from "../model/content-map";
import { IslandDependencyMap } from "../model/island-dependency-map";
import { IslandMap } from "../model/island-map";
import { notifyObserver, type ResolutionObserver } from "../observability/resolution-observer";
import { ResolutionError, ResourceGraphAbortedError } from "../errors";
import type { ExpansionContext, ExpansionPort } from "../ports/expansion-port";
import type { IslandPort } from "../ports/island-port";
import type { ResolvePort } from "../ports/resolve-port";
import type {
  ContentRegistry,
  IslandId,
  ResolveResourceGraphInput,
  ResolveResourceGraphOutput,
  ResourceKey,
} from "../types";

/** One walk step: a resource discovered from a specific island. */
export interface GraphWalkRef {
  resource: ApplicationResourceIdentifier;
  inheritedIslandId: IslandId;
}

interface FailureAccumulator {
  error: ResolutionError;
  inheritedIslandIds: Set<IslandId>;
}

/** An ARI awaiting a load, plus every island currently waiting for it. */
interface PendingEntry {
  resource: ApplicationResourceIdentifier;
  inheritedIslandIds: Set<IslandId>;
}

const VISIT_SEPARATOR = "\u0000";

function compareStrings(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

function sortedCopy<T extends string>(values: Iterable<T>): T[] {
  return [...values].sort(compareStrings);
}

/**
 * Graph state shared by the walk: content, islands, failures, pending waiters,
 * backing promotion, and expansion.
 *
 * Guarantees one pending entry per ARI while retaining every island waiting on
 * it, so a resource reached from several islands is loaded once and attributed to
 * all of them.
 */
export class ResolutionSession<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  readonly contentMap = new ContentMap<R>();
  readonly islands = new IslandMap();
  readonly islandDependencies = new IslandDependencyMap();

  private readonly failuresByResource = new Map<ResourceKey, FailureAccumulator>();
  private readonly pendingByKey = new Map<ResourceKey, PendingEntry>();
  /**
   * Abstract ARI key → canonical ARI to load next (e.g. CustomReference → Entry).
   * Decode payload stays until the target lands and {@link propagateRedirectPayloads}
   * overwrites it.
   */
  private readonly redirects = new Map<ResourceKey, ApplicationResourceIdentifier>();
  /** `(islandId, resourceKey)` pairs already expanded — kept out of {@link islands}. */
  private readonly visited = new Set<string>();
  private readonly backingResources: Map<ResourceKey, unknown>;
  private readonly promotedResourceKeys: ResourceKey[] = [];

  constructor(
    private readonly input: ResolveResourceGraphInput<TExecutionContext>,
    private readonly expansionPort: ExpansionPort<R, TExecutionContext>,
    private readonly islandPort: IslandPort<R, TExecutionContext>,
    private readonly resolvePort: ResolvePort<R, TExecutionContext>,
    private readonly observer?: ResolutionObserver
  ) {
    // Copied so the caller's map is never mutated; promotions are reported instead.
    this.backingResources =
      input.backingResources === undefined ? new Map() : new Map(input.backingResources);
  }

  get signal(): AbortSignal | undefined {
    return this.input.signal;
  }

  assertNotAborted(): void {
    const signal = this.input.signal;
    if (signal?.aborted === true) {
      throw new ResourceGraphAbortedError("Resource graph resolution was aborted", {
        cause: signal.reason,
      });
    }
  }

  isResolved(resource: ApplicationResourceIdentifier): boolean {
    return this.contentMap.has(resource);
  }

  hasFailure(resource: ApplicationResourceIdentifier): boolean {
    return this.failuresByResource.has(resource.toString());
  }

  /**
   * Failure recorded for `resource`, if any. Used by projectors under
   * `on failure set error` to place the same instance into the projected alias.
   */
  failureOf(resource: ApplicationResourceIdentifier): ResolutionError | undefined {
    const accumulated = this.failuresByResource.get(resource.toString());
    return accumulated?.error;
  }

  /** Snapshot of failures keyed by resource, for projection / set-error wiring. */
  failures(): ReadonlyMap<ResourceKey, ResolutionError> {
    const out = new Map<ResourceKey, ResolutionError>();
    for (const [resourceKey, accumulated] of this.failuresByResource) {
      out.set(
        resourceKey,
        accumulated.error.withAttribution(resourceKey, sortedCopy(accumulated.inheritedIslandIds))
      );
    }
    return out;
  }

  isPending(resource: ApplicationResourceIdentifier): boolean {
    return this.pendingByKey.has(resource.toString());
  }

  /**
   * Records `ref.inheritedIslandId` as a waiter for `ref.resource`.
   *
   * @returns `true` on the first arrival, meaning the caller should arrange a
   * load. `false` when the ARI is already pending, resolved, or failed — the
   * waiter is still retained for later expansion or error attribution.
   */
  rememberWaiter(ref: GraphWalkRef): boolean {
    const key = ref.resource.toString();

    if (this.contentMap.hasKey(key)) {
      return false;
    }

    const failure = this.failuresByResource.get(key);
    if (failure !== undefined) {
      failure.inheritedIslandIds.add(ref.inheritedIslandId);
      return false;
    }

    const pending = this.pendingByKey.get(key);
    if (pending !== undefined) {
      pending.inheritedIslandIds.add(ref.inheritedIslandId);
      return false;
    }

    this.pendingByKey.set(key, {
      resource: ref.resource,
      inheritedIslandIds: new Set([ref.inheritedIslandId]),
    });
    return true;
  }

  /** Islands currently waiting on `resource`, without clearing the pending entry. */
  waitersFor(resource: ApplicationResourceIdentifier): readonly IslandId[] {
    const entry = this.pendingByKey.get(resource.toString());
    return entry === undefined ? [] : [...entry.inheritedIslandIds];
  }

  /**
   * Clears pending tracking for `resource`.
   *
   * @returns the islands that were waiting on it. Callers must expand once per
   * returned island so multi-island membership stays complete.
   */
  settle(resource: ApplicationResourceIdentifier): readonly IslandId[] {
    const key = resource.toString();
    const entry = this.pendingByKey.get(key);
    this.pendingByKey.delete(key);
    return entry === undefined ? [] : [...entry.inheritedIslandIds];
  }

  /**
   * Promotes a backing payload into {@link contentMap} if one exists for
   * `resource`. Does not settle: the caller reads waiters and expands.
   */
  promoteFromBacking(resource: ApplicationResourceIdentifier): boolean {
    const key = resource.toString();
    if (!this.backingResources.has(key) || this.contentMap.hasKey(key)) {
      return false;
    }

    this.contentMap.set(
      resource as ApplicationResourceIdentifier<keyof R & string>,
      this.backingResources.get(key) as R[keyof R & string]
    );
    this.backingResources.delete(key);
    this.promotedResourceKeys.push(key);
    return true;
  }

  notifyBackingPromotion(
    resource: ApplicationResourceIdentifier,
    islandIds: readonly IslandId[]
  ): void {
    notifyObserver(this.observer, "onBackingPromote", () => ({ resource, islandIds }));
  }

  /**
   * Canonical ARI a prior strategy redirect pointed at (e.g. CustomReference → Entry).
   */
  redirectOf(resource: ApplicationResourceIdentifier): ApplicationResourceIdentifier | undefined {
    return this.redirects.get(resource.toString());
  }

  /**
   * After a decode payload is in {@link contentMap}, apply strategy resolve policies.
   *
   * Returns an existing redirect, a newly registered strategy redirect target, or
   * `undefined` when the resource should expand as usual. Decode payload stays until
   * the target lands and {@link propagateRedirectPayloads} overwrites it.
   */
  applyResolvePolicies(
    resource: ApplicationResourceIdentifier
  ): ApplicationResourceIdentifier | undefined {
    const existing = this.redirectOf(resource);
    if (existing !== undefined) {
      return existing;
    }

    const resourceKey = resource.toString();
    if (!this.contentMap.hasKey(resourceKey)) {
      return undefined;
    }

    const result = this.resolvePort.resolve(this.policyContextOf(resourceKey, resource));
    if (result === undefined) {
      return undefined;
    }

    this.redirects.set(resourceKey, result.resource);
    return result.resource;
  }

  /**
   * Commit positional `load` results: `payloads[i]` settles `resources[i]`.
   * `undefined` slots are skips (caller treats as missing).
   */
  commitPayloads(
    resources: readonly ApplicationResourceIdentifier[],
    payloads: readonly (R[keyof R & string] | undefined)[]
  ): void {
    for (let i = 0; i < resources.length; i++) {
      const resource = resources[i]!;
      const payload = payloads[i];
      if (payload === undefined) {
        continue;
      }

      this.contentMap.set(
        resource as ApplicationResourceIdentifier<keyof R & string>,
        payload as R[keyof R & string]
      );
      this.propagateRedirectPayloads(resource, payload as R[keyof R & string]);
    }
  }

  private propagateRedirectPayloads(
    resource: ApplicationResourceIdentifier,
    payload: R[keyof R & string]
  ): void {
    const settledKey = resource.toString();
    for (const [fromKey, toAri] of this.redirects) {
      if (toAri.toString() !== settledKey) {
        continue;
      }
      this.contentMap.setByKey(fromKey, payload);
    }
  }

  /**
   * Records a resource as unresolvable from `ref`'s island and clears its pending entry.
   *
   * Prefer passing a {@link ResolutionError} (preserved from a datasource or
   * wrapped from a load failure). A plain message becomes `code: "missing"`.
   */
  registerMissing(ref: GraphWalkRef, failure?: ResolutionError | string): void {
    const resourceKey = ref.resource.toString();
    const existing = this.failuresByResource.get(resourceKey);

    const error =
      existing?.error ??
      (typeof failure === "string" || failure === undefined
        ? new ResolutionError("missing", failure ?? `Unable to resolve ${resourceKey}`, undefined, {
            resourceKey,
          })
        : failure.withAttribution(resourceKey, failure.inheritedIslandIds));

    const accumulated = existing ?? {
      error,
      inheritedIslandIds: new Set<IslandId>(),
    };

    accumulated.inheritedIslandIds.add(ref.inheritedIslandId);
    this.failuresByResource.set(resourceKey, accumulated);
    this.pendingByKey.delete(resourceKey);

    if (existing !== undefined) {
      // Additional islands reaching the same failure are not new failures.
      return;
    }

    notifyObserver(this.observer, "onMissingResource", () => ({
      resourceKey,
      inheritedIslandIds: sortedCopy(accumulated.inheritedIslandIds),
      message: accumulated.error.message,
    }));
  }

  /**
   * Runs expansion for one `(resource, island)` pair and returns the child refs.
   *
   * Island bookkeeping happens here; routing and waiter registration are the
   * scheduler's job.
   */
  expand(ref: GraphWalkRef): GraphWalkRef[] {
    const resourceKey = ref.resource.toString();
    const policyContext = this.policyContextOf(resourceKey, ref.resource);
    const expansion = this.expansionPort.expand(policyContext);
    const islandBoundary = this.islandPort.resolve(policyContext);
    const isIsland = islandBoundary.startIsland;
    const islandId = isIsland ? (islandBoundary.islandId ?? resourceKey) : ref.inheritedIslandId;

    if (islandId !== ref.inheritedIslandId) {
      this.islandDependencies.add(ref.inheritedIslandId, islandId);
    }

    const visitKey = `${islandId}${VISIT_SEPARATOR}${resourceKey}`;
    if (this.visited.has(visitKey)) {
      return [];
    }
    this.visited.add(visitKey);
    this.islands.add(islandId, ref.resource);

    notifyObserver(this.observer, "onExpand", () => ({
      resource: ref.resource,
      islandId,
      isIsland,
      children: expansion.resources,
    }));

    const children: GraphWalkRef[] = [];
    for (const child of expansion.resources) {
      children.push({ resource: child, inheritedIslandId: islandId });
    }

    return children;
  }

  /**
   * Shared context for expansion and island policies on one resolved resource.
   */
  private policyContextOf(
    resourceKey: ResourceKey,
    resource: ApplicationResourceIdentifier
  ): ExpansionContext<R, TExecutionContext> {
    return {
      resource,
      payload: this.contentMap.getByKey(resourceKey)!,
      executionContext: this.input.executionContext,
    } as ExpansionContext<R, TExecutionContext>;
  }

  toOutput(): ResolveResourceGraphOutput<R> {
    const errors = [...this.failures().values()].sort((left, right) =>
      compareStrings(left.resourceKey ?? "", right.resourceKey ?? "")
    );

    return {
      contentMap: this.contentMap,
      islands: this.islands,
      islandDependencies: this.islandDependencies,
      errors,
      promotedResourceKeys: [...this.promotedResourceKeys],
      redirects: new Map(this.redirects),
    };
  }
}
