import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import {
  MissingResourceError,
  NoDataSourceError,
  ResolutionError,
  ResourceBatchLengthError,
  ResourceGraphError,
  ResourceGraphBudgetExceededError,
  ResourceLoadFailedError,
} from "../errors";
import { notifyObserver, type ResolutionObserver } from "../observability/resolution-observer";
import type { GraphResolutionStrategy } from "../strategy/create-graph-resolution-strategy";
import type { DataSource } from "../ports/data-source";
import { ResolutionSession, type GraphWalkRef } from "./resolution-session";
import type {
  ContentRegistry,
  IslandId,
  OnFailurePolicy,
  ResolutionBudget,
  ResolutionBudgetOptions,
  SchedulingMode,
  ResolveResourceGraphInput,
  ResolveResourceGraphOutput,
} from "../types";
import { normalizeResolutionBudget, ResolutionBudgetTracker } from "./resolution-budget";

/** Per-source scheduling state: one pending queue plus in-flight accounting. */
interface SourceLane<R extends ContentRegistry, TExecutionContext> {
  readonly source: DataSource<R, TExecutionContext>;
  readonly pending: GraphWalkRef[];
  pendingCount: number;
  inFlight: number;
  batchNumber: number;
}

type LoadCompletion<R extends ContentRegistry, TExecutionContext> = {
  readonly loadId: number;
  readonly lane: SourceLane<R, TExecutionContext>;
  readonly refs: readonly GraphWalkRef[];
  readonly batchNumber: number;
  readonly startedAt: number;
  readonly resources: readonly ApplicationResourceIdentifier[];
} & (
  | { readonly ok: true; readonly payloads: readonly (R[keyof R & string] | undefined)[] }
  | { readonly ok: false; readonly error: unknown }
);

const ROOT_ON_FAILURE: OnFailurePolicy = "throw";

function walkRef(
  resource: ApplicationResourceIdentifier,
  inheritedIslandId: IslandId,
  onFailure: OnFailurePolicy
): GraphWalkRef {
  return { resource, inheritedIslandId, onFailure };
}

export interface ResourceGraphResolverConfig<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  /**
   * Backends that own the ARI families in this graph.
   *
   * First-match routing: walks `sources` in order and picks the first source
   * whose optional `when` passes and whose `for` list contains a matching
   * family. Later overlaps are ignored — declare one owner per ARI family.
   */
  readonly sources: readonly DataSource<R, TExecutionContext>[];
  readonly strategy: GraphResolutionStrategy<R, TExecutionContext>;
  /** Defaults to `"lane"`. */
  readonly schedulingMode?: SchedulingMode;
  /** Hard per-resolution limits. Omitted fields use safe finite defaults. */
  readonly budget?: ResolutionBudgetOptions;
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
 * island bookkeeping; sources only declare what they handle and how to fetch it.
 */
export function createResourceGraphResolver<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
>(
  config: ResourceGraphResolverConfig<R, TExecutionContext>
): ResourceGraphResolver<R, TExecutionContext> {
  const schedulingMode = config.schedulingMode ?? "lane";
  const budget = normalizeResolutionBudget(config.budget);

  return {
    resolve: (input) => resolveResourceGraph(config, schedulingMode, budget, input),
  };
}

async function resolveResourceGraph<R extends ContentRegistry, TExecutionContext>(
  config: ResourceGraphResolverConfig<R, TExecutionContext>,
  schedulingMode: SchedulingMode,
  budget: Readonly<ResolutionBudget>,
  input: ResolveResourceGraphInput<TExecutionContext>
): Promise<ResolveResourceGraphOutput<R>> {
  const observer = config.observer;
  const resolutionStartedAt = Date.now();
  const budgetAbortController = new AbortController();
  const effectiveSignal =
    input.signal === undefined
      ? budgetAbortController.signal
      : AbortSignal.any([input.signal, budgetAbortController.signal]);
  const effectiveInput = { ...input, signal: effectiveSignal };
  const budgetTracker = new ResolutionBudgetTracker(budget, resolutionStartedAt, (error) => {
    notifyObserver(observer, "onBudgetExceeded", () => ({
      budget: error.budget,
      limit: error.limit,
      actual: error.actual,
      usage: error.usage,
    }));
  });
  const session = new ResolutionSession<R, TExecutionContext>(
    effectiveInput,
    config.strategy.expansion,
    config.strategy.islands,
    config.strategy.resolve,
    observer
  );

  session.assertNotAborted();

  if (input.roots.length === 0) {
    throw new ResourceGraphError("ResolveResourceGraphInput.roots must be non-empty");
  }

  const lanes: SourceLane<R, TExecutionContext>[] = config.sources.map((source) => ({
    source,
    pending: [],
    pendingCount: 0,
    inFlight: 0,
    batchNumber: 0,
  }));

  notifyObserver(observer, "onResolutionStart", () => ({
    roots: input.roots,
    schedulingMode,
    sourceIds: config.sources.map((source) => source.id),
    budget,
  }));

  const workQueue: GraphWalkRef[] = [];
  const inFlight = new Map<number, Promise<LoadCompletion<R, TExecutionContext>>>();
  let nextLoadId = 1;

  const enqueue = (refs: readonly GraphWalkRef[]): void => {
    for (const ref of refs) {
      budgetTracker.discoverNode(ref.resource);
      workQueue.push(ref);
    }
  };

  const expandInto = (
    resource: ApplicationResourceIdentifier,
    islandIds: readonly IslandId[]
  ): void => {
    for (const inheritedIslandId of islandIds) {
      const children = session.expand(walkRef(resource, inheritedIslandId, ROOT_ON_FAILURE));
      for (const child of children) {
        budgetTracker.discoverExpansion(resource, inheritedIslandId, child.resource);
      }
      enqueue(children);
    }
  };

  /**
   * After settle: follow strategy redirects, else expand.
   * Does not treat a missing payload as an error — callers check that first when needed.
   */
  const continueAfterPayload = (
    resource: ApplicationResourceIdentifier,
    islandIds: readonly IslandId[],
    onFailure: OnFailurePolicy
  ): void => {
    const redirectTo = session.applyResolvePolicies(resource);
    if (redirectTo !== undefined) {
      budgetTracker.discoverRedirect(resource, redirectTo);
      for (const inheritedIslandId of islandIds) {
        enqueue([walkRef(redirectTo, inheritedIslandId, onFailure)]);
      }
      return;
    }

    expandInto(resource, islandIds);
  };

  /** Islands waiting on `ref`, falling back to the ref's own island. */
  const islandsWaitingOn = (ref: GraphWalkRef): readonly IslandId[] => {
    const waiters = session.waitersFor(ref.resource);
    return waiters.length > 0 ? waiters : [ref.inheritedIslandId];
  };

  const failResource = (ref: GraphWalkRef, error: ResourceGraphError): void => {
    // Callers must pass the effective edge policy on `ref` (capture before settle).
    if (ref.onFailure === "throw") {
      throw error;
    }

    // setNull and setError both record into `errors`; projection chooses null vs ResolutionError.
    session.registerMissing(ref, toCollectedResolutionError(ref, error));
  };

  const routeOf = (
    resource: ApplicationResourceIdentifier
  ): SourceLane<R, TExecutionContext> | undefined => {
    for (const lane of lanes) {
      const source = lane.source;

      if (
        source.when !== undefined &&
        !source.when({ resource, executionContext: input.executionContext })
      ) {
        continue;
      }

      for (const family of source.for) {
        if (family.matches(resource)) {
          return lane;
        }
      }
    }

    return undefined;
  };

  const visit = (ref: GraphWalkRef): void => {
    const redirectTo = session.redirectOf(ref.resource);
    if (redirectTo !== undefined) {
      // In-memory locator already converted — follow the canonical ARI.
      enqueue([walkRef(redirectTo, ref.inheritedIslandId, ref.onFailure)]);
      return;
    }

    if (session.isResolved(ref.resource)) {
      continueAfterPayload(ref.resource, [ref.inheritedIslandId], ref.onFailure);
      return;
    }

    if (session.hasFailure(ref.resource)) {
      session.rememberWaiter(ref);
      if (session.onFailureOf(ref.resource) === "throw") {
        throw new MissingResourceError(ref.resource.toString(), [ref.inheritedIslandId]);
      }
      return;
    }

    if (!session.rememberWaiter(ref)) {
      // Already pending; this island is now recorded as a waiter (policy upgraded).
      return;
    }

    if (session.promoteFromBacking(ref.resource)) {
      const islandIds = session.settle(ref.resource);
      session.notifyBackingPromotion(ref.resource, islandIds);
      continueAfterPayload(ref.resource, islandIds, ref.onFailure);
      return;
    }

    const lane = routeOf(ref.resource);
    if (lane === undefined) {
      failResource(ref, new NoDataSourceError(ref.resource.toString()));
      return;
    }

    lane.pending.push(ref);
    lane.pendingCount += 1;
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
    const configured = lane.source.batchSize;
    const limit =
      configured === undefined ? lane.pending.length : Math.max(1, Math.trunc(configured));
    const slice = lane.pending.splice(0, Math.min(limit, lane.pending.length));
    lane.pendingCount -= slice.length;

    const refs: GraphWalkRef[] = [];
    const resources: ApplicationResourceIdentifier[] = [];

    for (const ref of slice) {
      // Another batch (or backing promote) may have settled this ARI while it
      // waited in the lane — expand instead of fetching again.
      if (session.isResolved(ref.resource)) {
        const islandIds = islandsWaitingOn(ref);
        session.settle(ref.resource);
        continueAfterPayload(ref.resource, islandIds, session.onFailureOf(ref.resource));
        continue;
      }

      if (session.hasFailure(ref.resource)) {
        continue;
      }

      refs.push(ref);
      resources.push(ref.resource);
    }

    if (refs.length === 0) {
      return;
    }

    budgetTracker.startBatch();
    lane.batchNumber += 1;
    lane.inFlight += 1;

    const loadId = nextLoadId;
    nextLoadId += 1;
    const batchNumber = lane.batchNumber;
    const startedAt = Date.now();

    notifyObserver(observer, "onBatchStart", () => ({
      sourceId: lane.source.id,
      batchNumber,
      resources,
      resourceCount: refs.length,
    }));

    const completion = lane.source
      .load(resources, {
        signal: effectiveSignal,
        executionContext: input.executionContext,
        batchNumber,
      })
      .then(
        (payloads): LoadCompletion<R, TExecutionContext> => ({
          ok: true,
          loadId,
          lane,
          refs,
          batchNumber,
          startedAt,
          resources,
          payloads,
        }),
        (error: unknown): LoadCompletion<R, TExecutionContext> => ({
          ok: false,
          loadId,
          lane,
          refs,
          batchNumber,
          startedAt,
          resources,
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

    const resourceKeys = completion.refs.map((ref) => ref.resource.toString());
    const thrown = completion.error;
    const shouldThrow = completion.refs.some(
      (ref) => session.onFailureOf(ref.resource) === "throw"
    );

    // Datasources may reject with ResolutionError; preserve code/message/originalError.
    if (thrown instanceof ResolutionError) {
      if (shouldThrow) {
        const first = completion.refs[0]!;
        throw thrown.withAttribution(first.resource.toString(), islandsWaitingOn(first));
      }

      for (const ref of completion.refs) {
        const onFailure = session.onFailureOf(ref.resource);
        for (const inheritedIslandId of islandsWaitingOn(ref)) {
          const attributed = walkRef(ref.resource, inheritedIslandId, onFailure);
          session.registerMissing(
            attributed,
            thrown.withAttribution(ref.resource.toString(), [inheritedIslandId])
          );
        }
      }
      return;
    }

    const failure = new ResourceLoadFailedError(completion.lane.source.id, resourceKeys, {
      cause: thrown,
    });

    if (shouldThrow) {
      throw failure;
    }

    // setNull / setError: wrap non-ResolutionError rejects as ResolutionError when collecting.
    for (const ref of completion.refs) {
      const onFailure = session.onFailureOf(ref.resource);
      for (const inheritedIslandId of islandsWaitingOn(ref)) {
        const attributed = walkRef(ref.resource, inheritedIslandId, onFailure);
        session.registerMissing(
          attributed,
          new ResolutionError("load_failed", failure.message, thrown, {
            resourceKey: ref.resource.toString(),
            inheritedIslandIds: [inheritedIslandId],
          })
        );
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
      resolvedCount: completion.payloads.filter((payload) => payload !== undefined).length,
      durationMs,
    }));

    session.assertNotAborted();

    if (completion.payloads.length !== completion.resources.length) {
      throw new ResourceBatchLengthError(
        completion.lane.source.id,
        completion.resources.length,
        completion.payloads.length
      );
    }

    session.commitPayloads(completion.resources, completion.payloads);

    for (const ref of completion.refs) {
      const islandIds = islandsWaitingOn(ref);
      const onFailure = session.onFailureOf(ref.resource);
      session.settle(ref.resource);

      if (!session.isResolved(ref.resource)) {
        for (const inheritedIslandId of islandIds) {
          failResource(
            walkRef(ref.resource, inheritedIslandId, onFailure),
            new MissingResourceError(ref.resource.toString(), islandIds)
          );
        }
        continue;
      }

      continueAfterPayload(ref.resource, islandIds, onFailure);
    }
  };

  let rejectDeadline!: (error: ResourceGraphBudgetExceededError) => void;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const deadlineTimer = setTimeout(
    () => {
      const error = budgetTracker.exceedDuration();
      budgetAbortController.abort(error);
      rejectDeadline(error);
    },
    Math.max(0, budget.maxDurationMs - (Date.now() - resolutionStartedAt))
  );

  try {
    for (const root of input.roots) {
      enqueue([walkRef(root, root.toString(), ROOT_ON_FAILURE)]);
    }

    while (true) {
      budgetTracker.assertDuration();
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

      if (schedulingMode === "barrier") {
        const round = [...inFlight.values()];
        inFlight.clear();
        for (const completion of await Promise.race([Promise.all(round), deadline])) {
          handleCompletion(completion);
        }
        continue;
      }

      const completion = await Promise.race([...inFlight.values(), deadline]);
      inFlight.delete(completion.loadId);
      handleCompletion(completion);
    }
    budgetTracker.assertDuration();
  } catch (error) {
    if (error instanceof ResourceGraphBudgetExceededError) {
      budgetAbortController.abort(error);
      inFlight.clear();
      throw error;
    }
    try {
      await Promise.race([settleRemainingLoads(), deadline]);
    } catch (cleanupError) {
      if (cleanupError instanceof ResourceGraphBudgetExceededError) {
        budgetAbortController.abort(cleanupError);
        inFlight.clear();
      }
      throw cleanupError;
    }
    throw error;
  } finally {
    clearTimeout(deadlineTimer);
  }

  session.assertNotAborted();

  const output = session.toOutput();

  const resolutionEndedAt = Date.now();
  notifyObserver(observer, "onResolutionEnd", () => ({
    durationMs: resolutionEndedAt - resolutionStartedAt,
    resolvedCount: output.contentMap.size,
    errorCount: output.errors.length,
    promotedCount: output.promotedResourceKeys.length,
    budgetUsage: budgetTracker.usage(resolutionEndedAt),
  }));

  return output;
}

/**
 * Maps a thrown graph error into a {@link ResolutionError} for collect / set-error paths.
 * Datasource `ResolutionError` instances are preserved (attribution only).
 */
function toCollectedResolutionError(ref: GraphWalkRef, error: ResourceGraphError): ResolutionError {
  const resourceKey = ref.resource.toString();
  const inheritedIslandIds = [ref.inheritedIslandId];

  if (error instanceof ResolutionError) {
    return error.withAttribution(resourceKey, inheritedIslandIds);
  }

  if (error instanceof MissingResourceError) {
    return new ResolutionError("missing", error.message, error.cause, {
      resourceKey,
      inheritedIslandIds,
    });
  }

  if (error instanceof NoDataSourceError) {
    return new ResolutionError("no_data_source", error.message, undefined, {
      resourceKey,
      inheritedIslandIds,
    });
  }

  if (error instanceof ResourceLoadFailedError) {
    return new ResolutionError("load_failed", error.message, error.cause, {
      resourceKey,
      inheritedIslandIds,
    });
  }

  return new ResolutionError("unknown", error.message, error, {
    resourceKey,
    inheritedIslandIds,
  });
}
