import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import {
  MissingResourceError,
  NoDataSourceError,
  ResourceLoadFailedError,
  type ResourceGraphError,
} from "../errors";
import { notifyObserver, type ResolutionObserver } from "../observability/resolution-observer";
import type { ExpansionPort } from "../ports/expansion-port";
import type { ResourceFamily, DataSource } from "../ports/data-source";
import { ResolutionSession, type GraphWalkRef } from "./resolution-session";
import type {
  ContentRegistry,
  IslandId,
  ResolutionStrategy,
  ResolveResourceGraphInput,
  ResolveResourceGraphOutput,
  ResolvedResourceRecord,
} from "../types";

/** Per-source scheduling state: work waiting per family, plus in-flight accounting. */
interface SourceLane<R extends ContentRegistry, TExecutionContext> {
  readonly source: DataSource<R, TExecutionContext>;
  readonly familyKeys: readonly string[];
  readonly pending: Map<string, GraphWalkRef[]>;
  pendingCount: number;
  inFlight: number;
  batchNumber: number;
}

interface RouteCandidate<R extends ContentRegistry, TExecutionContext> {
  readonly lane: SourceLane<R, TExecutionContext>;
  readonly familyKey: string;
  readonly family: ResourceFamily;
}

type ResourcesByFamily = Readonly<Record<string, readonly ApplicationResourceIdentifier[]>>;

type LoadCompletion<R extends ContentRegistry, TExecutionContext> = {
  readonly loadId: number;
  readonly lane: SourceLane<R, TExecutionContext>;
  readonly refs: readonly GraphWalkRef[];
  readonly batchNumber: number;
  readonly startedAt: number;
  readonly resourcesByFamily: ResourcesByFamily;
} & (
  | { readonly ok: true; readonly records: readonly ResolvedResourceRecord<R>[] }
  | { readonly ok: false; readonly error: unknown }
);

export interface ResourceGraphResolverConfig<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  /**
   * Backends that own the ARI families in this graph.
   *
   * Routing is by ARI `type`; when several sources declare the same type, the
   * first whose family `matches` the ARI wins.
   */
  readonly sources: readonly DataSource<R, TExecutionContext>[];
  readonly expansion: ExpansionPort<R, TExecutionContext>;
  /** Defaults to `"lane"`. */
  readonly strategy?: ResolutionStrategy;
  readonly observer?: ResolutionObserver;
}

export interface ResourceGraphResolver<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  resolve(
    input: ResolveResourceGraphInput<TExecutionContext>
  ): Promise<ResolveResourceGraphOutput<R>>;
}

/**
 * Builds a reusable resolver for one set of sources and expansion policies.
 *
 * The resolver owns routing, batching, per-source concurrency, scheduling and
 * island bookkeeping; sources only declare what they own and how to fetch it.
 */
export function createResourceGraphResolver<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
>(
  config: ResourceGraphResolverConfig<R, TExecutionContext>
): ResourceGraphResolver<R, TExecutionContext> {
  const strategy = config.strategy ?? "lane";

  return {
    resolve: (input) => resolveResourceGraph(config, strategy, input),
  };
}

async function resolveResourceGraph<R extends ContentRegistry, TExecutionContext>(
  config: ResourceGraphResolverConfig<R, TExecutionContext>,
  strategy: ResolutionStrategy,
  input: ResolveResourceGraphInput<TExecutionContext>
): Promise<ResolveResourceGraphOutput<R>> {
  const observer = config.observer;
  const session = new ResolutionSession<R, TExecutionContext>(input, config.expansion, observer);
  const resolutionStartedAt = Date.now();

  session.assertNotAborted();

  const lanes: SourceLane<R, TExecutionContext>[] = config.sources.map((source) => {
    const familyKeys = Object.keys(source.families);

    return {
      source,
      familyKeys,
      pending: new Map(familyKeys.map((familyKey) => [familyKey, [] as GraphWalkRef[]])),
      pendingCount: 0,
      inFlight: 0,
      batchNumber: 0,
    };
  });

  const routesByAriType = new Map<string, RouteCandidate<R, TExecutionContext>[]>();
  for (const lane of lanes) {
    for (const familyKey of lane.familyKeys) {
      const family = lane.source.families[familyKey]!;
      const candidates = routesByAriType.get(family.type) ?? [];
      candidates.push({ lane, familyKey, family });
      routesByAriType.set(family.type, candidates);
    }
  }

  notifyObserver(observer, "onResolutionStart", () => ({
    root: input.root,
    strategy,
    sourceIds: config.sources.map((source) => source.id),
  }));

  const workQueue: GraphWalkRef[] = [];
  const inFlight = new Map<number, Promise<LoadCompletion<R, TExecutionContext>>>();
  let nextLoadId = 1;

  const enqueue = (refs: readonly GraphWalkRef[]): void => {
    for (const ref of refs) {
      workQueue.push(ref);
    }
  };

  const expandInto = (
    resource: ApplicationResourceIdentifier,
    islandIds: readonly IslandId[]
  ): void => {
    for (const inheritedIslandId of islandIds) {
      enqueue(session.expand({ resource, inheritedIslandId }));
    }
  };

  /** Islands waiting on `ref`, falling back to the ref's own island. */
  const islandsWaitingOn = (ref: GraphWalkRef): readonly IslandId[] => {
    const waiters = session.waitersFor(ref.resource);
    return waiters.length > 0 ? waiters : [ref.inheritedIslandId];
  };

  const failResource = (ref: GraphWalkRef, error: ResourceGraphError): void => {
    if (input.missingResourceMode === "throw") {
      throw error;
    }

    session.registerMissing(ref, error.message);
  };

  const routeOf = (
    resource: ApplicationResourceIdentifier
  ): RouteCandidate<R, TExecutionContext> | undefined => {
    const candidates = routesByAriType.get(resource.type);
    if (candidates === undefined) {
      return undefined;
    }

    for (const candidate of candidates) {
      if (candidate.family.matches(resource)) {
        return candidate;
      }
    }

    return undefined;
  };

  const visit = (ref: GraphWalkRef): void => {
    if (session.isResolved(ref.resource)) {
      enqueue(session.expand(ref));
      return;
    }

    if (session.hasFailure(ref.resource)) {
      failResource(ref, new MissingResourceError(ref.resource.toString(), [ref.inheritedIslandId]));
      return;
    }

    if (!session.rememberWaiter(ref)) {
      // Already pending; this island is now recorded as a waiter.
      return;
    }

    if (session.promoteFromBacking(ref.resource)) {
      const islandIds = session.settle(ref.resource);
      session.notifyBackingPromotion(ref.resource, islandIds);
      expandInto(ref.resource, islandIds);
      return;
    }

    const route = routeOf(ref.resource);
    if (route === undefined) {
      failResource(ref, new NoDataSourceError(ref.resource.toString()));
      return;
    }

    route.lane.pending.get(route.familyKey)!.push(ref);
    route.lane.pendingCount += 1;
  };

  const drain = (): void => {
    let index = 0;
    while (index < workQueue.length) {
      visit(workQueue[index]!);
      index += 1;
    }

    workQueue.length = 0;
  };

  const startLoad = (lane: SourceLane<R, TExecutionContext>): void => {
    const refs: GraphWalkRef[] = [];
    const resourcesByFamily: Record<string, readonly ApplicationResourceIdentifier[]> = {};

    for (const familyKey of lane.familyKeys) {
      const queue = lane.pending.get(familyKey)!;
      const configured = lane.source.batchSize[familyKey];
      const limit = configured === undefined ? queue.length : Math.max(1, Math.trunc(configured));
      const slice = queue.splice(0, Math.min(limit, queue.length));
      lane.pendingCount -= slice.length;

      const resources: ApplicationResourceIdentifier[] = [];
      for (const ref of slice) {
        // A source may return records it was never asked for, resolving an ARI
        // that is still queued elsewhere. Expand it instead of fetching again.
        if (session.isResolved(ref.resource)) {
          const islandIds = islandsWaitingOn(ref);
          session.settle(ref.resource);
          expandInto(ref.resource, islandIds);
          continue;
        }

        if (session.hasFailure(ref.resource)) {
          continue;
        }

        refs.push(ref);
        resources.push(ref.resource);
      }

      resourcesByFamily[familyKey] = resources;
    }

    if (refs.length === 0) {
      return;
    }

    lane.batchNumber += 1;
    lane.inFlight += 1;

    const loadId = nextLoadId;
    nextLoadId += 1;
    const batchNumber = lane.batchNumber;
    const startedAt = Date.now();

    notifyObserver(observer, "onBatchStart", () => ({
      sourceId: lane.source.id,
      batchNumber,
      resourcesByFamily,
      resourceCount: refs.length,
    }));

    const completion = lane.source
      .load(resourcesByFamily, {
        signal: input.signal,
        executionContext: input.executionContext,
        batchNumber,
      })
      .then(
        (records): LoadCompletion<R, TExecutionContext> => ({
          ok: true,
          loadId,
          lane,
          refs,
          batchNumber,
          startedAt,
          resourcesByFamily,
          records,
        }),
        (error: unknown): LoadCompletion<R, TExecutionContext> => ({
          ok: false,
          loadId,
          lane,
          refs,
          batchNumber,
          startedAt,
          resourcesByFamily,
          error,
        })
      );

    inFlight.set(loadId, completion);
  };

  const startEligibleLoads = (): void => {
    for (const lane of lanes) {
      while (lane.inFlight < lane.source.concurrency && lane.pendingCount > 0) {
        startLoad(lane);
      }
    }
  };

  /** Observes outstanding loads so a failure never leaves unhandled rejections. */
  const settleRemainingLoads = async (): Promise<void> => {
    if (inFlight.size === 0) {
      return;
    }

    const outstanding = [...inFlight.values()];
    inFlight.clear();
    await Promise.all(outstanding);

    for (const lane of lanes) {
      lane.inFlight = 0;
    }
  };

  const handleFailedLoad = (
    completion: LoadCompletion<R, TExecutionContext> & { ok: false },
    durationMs: number
  ): void => {
    notifyObserver(observer, "onBatchError", () => ({
      sourceId: completion.lane.source.id,
      batchNumber: completion.batchNumber,
      requestedCount: completion.refs.length,
      durationMs,
      error: completion.error,
    }));

    const failure = new ResourceLoadFailedError(
      completion.lane.source.id,
      completion.refs.map((ref) => ref.resource.toString()),
      { cause: completion.error }
    );

    if (input.missingResourceMode === "throw") {
      throw failure;
    }

    // Collect mode: the batch's resources are unresolvable, other sources continue.
    for (const ref of completion.refs) {
      for (const inheritedIslandId of islandsWaitingOn(ref)) {
        session.registerMissing({ resource: ref.resource, inheritedIslandId }, failure.message);
      }
    }
  };

  const handleCompletion = (completion: LoadCompletion<R, TExecutionContext>): void => {
    const durationMs = Date.now() - completion.startedAt;
    completion.lane.inFlight -= 1;

    if (!completion.ok) {
      handleFailedLoad(completion, durationMs);
      return;
    }

    notifyObserver(observer, "onBatchEnd", () => ({
      sourceId: completion.lane.source.id,
      batchNumber: completion.batchNumber,
      requestedCount: completion.refs.length,
      resolvedCount: completion.records.length,
      durationMs,
    }));

    session.assertNotAborted();
    session.commitRecords(completion.records);

    for (const ref of completion.refs) {
      const islandIds = islandsWaitingOn(ref);
      session.settle(ref.resource);

      if (!session.isResolved(ref.resource)) {
        for (const inheritedIslandId of islandIds) {
          failResource(
            { resource: ref.resource, inheritedIslandId },
            new MissingResourceError(ref.resource.toString(), islandIds)
          );
        }
        continue;
      }

      expandInto(ref.resource, islandIds);
    }
  };

  try {
    enqueue([{ resource: input.root, inheritedIslandId: input.root.toString() }]);

    while (true) {
      session.assertNotAborted();
      drain();
      startEligibleLoads();

      if (inFlight.size === 0) {
        // `startEligibleLoads` can enqueue work when a queued ARI turned out to
        // be resolved already, so re-drain before declaring the walk finished.
        if (workQueue.length > 0) {
          continue;
        }
        break;
      }

      if (strategy === "barrier") {
        const round = [...inFlight.values()];
        inFlight.clear();
        for (const completion of await Promise.all(round)) {
          handleCompletion(completion);
        }
        continue;
      }

      const completion = await Promise.race([...inFlight.values()]);
      inFlight.delete(completion.loadId);
      handleCompletion(completion);
    }
  } catch (error) {
    await settleRemainingLoads();
    throw error;
  }

  session.assertNotAborted();

  const output = session.toOutput();

  notifyObserver(observer, "onResolutionEnd", () => ({
    durationMs: Date.now() - resolutionStartedAt,
    resolvedCount: output.contentMap.size,
    errorCount: output.errors.length,
    promotedCount: output.promotedResourceKeys.length,
  }));

  return output;
}
