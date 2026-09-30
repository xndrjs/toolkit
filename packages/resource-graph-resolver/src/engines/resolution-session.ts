import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import { ContentMap } from "../model/content-map";
import { IslandDependencyMap } from "../model/island-dependency-map";
import { IslandMap } from "../model/island-map";
import { notifyObserver, type ResolutionObserver } from "../observability/resolution-observer";
import {
  ResolutionError,
  ResourceGraphAbortedError,
  ResourceGraphBudgetExceededError,
} from "../errors";
import {
  stricterOnFailure,
  type ExpansionContext,
  type ExpansionPort,
} from "../ports/expansion-port";
import type { IslandPort } from "../ports/island-port";
import type { ResolvePort } from "../ports/resolve-port";
import type {
  ContentRegistry,
  IslandId,
  OnFailurePolicy,
  ResolveResourceGraphInput,
  ResolveResourceGraphOutput,
  ResourceKey,
} from "../types";
import { RedirectGraph } from "./redirect-graph";

/** One walk step: a resource discovered from a specific island. */
export interface GraphWalkRef {
  resource: ApplicationResourceIdentifier;
  inheritedIslandId: IslandId;
  /** Failure policy for this edge. Roots always use `"throw"`. */
  onFailure: OnFailurePolicy;
}

interface FailureAccumulator {
  error: ResolutionError;
  inheritedIslandIds: Set<IslandId>;
  onFailure: OnFailurePolicy;
}

/** An ARI awaiting a load, plus every island currently waiting for it. */
interface PendingEntry {
  resource: ApplicationResourceIdentifier;
  inheritedIslandIds: Set<IslandId>;
  onFailure: OnFailurePolicy;
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
  private readonly redirects = new RedirectGraph();
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
      if (signal.reason instanceof ResourceGraphBudgetExceededError) {
        throw signal.reason;
      }
      throw new ResourceGraphAbortedError("Resource graph resolution was aborted", {
        cause: signal.reason,
      });
    }
  }

  isResolved(resource: ApplicationResourceIdentifier): boolean {
    return this.contentMap.has(resource);
  }

  hasFailure(resource: ApplicationResourceIdentifier): boolean {
    return this.failuresByResource.has(this.redirects.canonicalOf(resource).toString());
  }

  /**
   * Effective failure policy for a pending or already-failed resource.
   * Defaults to `"throw"` when the ARI is not tracked.
   */
  onFailureOf(resource: ApplicationResourceIdentifier): OnFailurePolicy {
    const key = this.redirects.canonicalOf(resource).toString();
    const pending = this.pendingByKey.get(key);
    if (pending !== undefined) {
      return pending.onFailure;
    }

    const failure = this.failuresByResource.get(key);
    if (failure !== undefined) {
      return failure.onFailure;
    }

    return "throw";
  }

  /**
   * Failure recorded for `resource`, if any. Used by projectors under
   * `on failure set error` to place the same instance into the projected alias.
   */
  failureOf(resource: ApplicationResourceIdentifier): ResolutionError | undefined {
    const accumulated = this.failuresByResource.get(
      this.redirects.canonicalOf(resource).toString()
    );
    return accumulated?.error;
  }

  /** Snapshot keyed by canonical resources and every redirect alias. */
  failures(): ReadonlyMap<ResourceKey, ResolutionError> {
    const out = new Map<ResourceKey, ResolutionError>();
    for (const resourceKey of [...this.failuresByResource.keys()].sort(compareStrings)) {
      const accumulated = this.failuresByResource.get(resourceKey)!;
      const error = accumulated.error.withAttribution(
        resourceKey,
        sortedCopy(accumulated.inheritedIslandIds)
      );
      out.set(resourceKey, error);
      for (const aliasKey of this.redirects.aliasesOfKey(resourceKey)) {
        out.set(aliasKey, error);
      }
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
      failure.onFailure = stricterOnFailure(failure.onFailure, ref.onFailure);
      return false;
    }

    const pending = this.pendingByKey.get(key);
    if (pending !== undefined) {
      pending.inheritedIslandIds.add(ref.inheritedIslandId);
      pending.onFailure = stricterOnFailure(pending.onFailure, ref.onFailure);
      return false;
    }

    this.pendingByKey.set(key, {
      resource: ref.resource,
      inheritedIslandIds: new Set([ref.inheritedIslandId]),
      onFailure: ref.onFailure,
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

    this.commitPayload(resource, this.backingResources.get(key) as R[keyof R & string]);
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
    return this.redirects.redirectOf(resource);
  }

  /**
   * After a decode payload is in {@link contentMap}, apply strategy resolve policies.
   *
   * Returns an existing redirect, a newly registered strategy redirect target, or
   * `undefined` when the resource should expand as usual. A locator decode payload is
   * replaced across the alias set when the canonical target settles.
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

    const canonical = this.redirects.link(resource, result.resource);
    this.synchronizeAliases(canonical);
    return canonical;
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

      this.commitPayload(resource, payload as R[keyof R & string]);
    }
  }

  private commitPayload(
    resource: ApplicationResourceIdentifier,
    payload: R[keyof R & string]
  ): void {
    this.contentMap.set(
      resource as ApplicationResourceIdentifier<keyof R & string>,
      payload as R[keyof R & string]
    );
    for (const aliasKey of this.redirects.aliasesOf(resource)) {
      this.contentMap.setByKey(aliasKey, payload);
    }
  }

  private synchronizeAliases(canonical: ApplicationResourceIdentifier): void {
    const canonicalKey = canonical.toString();
    const payload = this.contentMap.getByKey(canonicalKey);
    if (payload !== undefined) {
      for (const aliasKey of this.redirects.aliasesOf(canonical)) {
        this.contentMap.setByKey(aliasKey, payload);
      }
      return;
    }

    if (this.failuresByResource.has(canonicalKey)) {
      for (const aliasKey of this.redirects.aliasesOf(canonical)) {
        this.contentMap.deleteByKey(aliasKey);
      }
    }
  }

  /**
   * Records a resource as unresolvable from `ref`'s island and clears its pending entry.
   *
   * Prefer passing a {@link ResolutionError} (preserved from a datasource or
   * wrapped from a load failure). A plain message becomes `code: "missing"`.
   * Used for soft `onFailure` (`setNull` / `setError`); both appear in `errors`.
   */
  registerMissing(ref: GraphWalkRef, failure?: ResolutionError | string): void {
    const resourceKey = this.redirects.canonicalOf(ref.resource).toString();
    const pending = this.pendingByKey.get(resourceKey);
    const existing = this.failuresByResource.get(resourceKey);
    const onFailure = stricterOnFailure(
      pending?.onFailure ?? existing?.onFailure ?? "setError",
      ref.onFailure
    );

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
      onFailure,
    };

    accumulated.inheritedIslandIds.add(ref.inheritedIslandId);
    accumulated.onFailure = stricterOnFailure(accumulated.onFailure, onFailure);
    this.failuresByResource.set(resourceKey, accumulated);
    this.pendingByKey.delete(resourceKey);
    this.contentMap.deleteByKey(resourceKey);
    for (const aliasKey of this.redirects.aliasesOfKey(resourceKey)) {
      this.contentMap.deleteByKey(aliasKey);
    }

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

    const defaultOnFailure = expansion.onFailure ?? "throw";
    const children: GraphWalkRef[] = [];
    for (const child of expansion.resources) {
      const key = child.toString();
      children.push({
        resource: child,
        inheritedIslandId: islandId,
        onFailure: expansion.onFailureByKey?.get(key) ?? defaultOnFailure,
      });
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
    const failures = this.failures();
    const errors = [...this.failuresByResource.keys()]
      .sort(compareStrings)
      .map((resourceKey) => failures.get(resourceKey)!);

    return {
      contentMap: this.contentMap,
      islands: this.islands,
      islandDependencies: this.islandDependencies,
      errors,
      failures,
      promotedResourceKeys: [...this.promotedResourceKeys],
      redirects: this.redirects.snapshot(),
    };
  }
}
