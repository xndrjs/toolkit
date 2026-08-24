import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { DataResolutionPull } from "../ports/data-resolution-port";
import type { ExpansionPort } from "../ports/expansion-port";
import { GraphResolutionSession, type GraphWalkRef } from "./graph-resolution-session";
import type { ResourceLoader } from "../ports/resource-loader";
import type {
  ContentRegistry,
  IslandId,
  ResolveContentGraphInput,
  ResolveContentGraphOutput,
  ResolvedResourceRecord,
  ResourceKey,
} from "../types";

interface LaneState<R extends ContentRegistry> {
  readonly loader: ResourceLoader<R>;
  frontier: GraphWalkRef[];
  frontierKeys: Set<ResourceKey>;
  inFlight: Promise<LaneCompletion<R>> | null;
}

type LaneCompletion<R extends ContentRegistry> =
  | {
      ok: true;
      laneIndex: number;
      taken: GraphWalkRef[];
      records: readonly ResolvedResourceRecord<R>[];
    }
  | {
      ok: false;
      laneIndex: number;
      taken: GraphWalkRef[];
      error: unknown;
    };

/**
 * Resolves a content resource graph with a serial-per-loader scheduler.
 *
 * Each {@link ResourceLoader} owns a lane with at most one in-flight {@link ResourceLoader.process}
 * call. Different loaders may overlap in time; a fast loader may start its next batch as soon as
 * its previous batch is committed and expanded.
 *
 * Same {@link ResolveContentGraphEngine.execute} contract as the barrier engine; construct from an
 * ordered loader chain plus {@link ExpansionPort}.
 */
export class DecoupledResolveContentGraphEngine<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  constructor(
    private readonly loaders: readonly ResourceLoader<R>[],
    private readonly expansionPort: ExpansionPort<R, TExecutionContext>
  ) {}

  async execute(
    input: ResolveContentGraphInput<TExecutionContext>
  ): Promise<ResolveContentGraphOutput<R>> {
    const session = new GraphResolutionSession<R, TExecutionContext>(input, this.expansionPort);

    session.assertNotAborted();

    const lanes: LaneState<R>[] = this.loaders.map((loader) => ({
      loader,
      frontier: [],
      frontierKeys: new Set<ResourceKey>(),
      inFlight: null,
    }));

    const isOnAnyLane = (key: ResourceKey): boolean =>
      lanes.some((lane) => lane.frontierKeys.has(key));

    const removeFromLanes = (key: ResourceKey): void => {
      for (const lane of lanes) {
        if (!lane.frontierKeys.delete(key)) {
          continue;
        }
        lane.frontier = lane.frontier.filter((item) => item.resource.toString() !== key);
      }
    };

    const expandForIslands = (
      resource: ApplicationResourceIdentifier,
      islandIds: readonly IslandId[]
    ): void => {
      for (const inheritedIslandId of islandIds) {
        ingest(session.expand({ resource, inheritedIslandId }));
      }
    };

    const promoteBackingForRefs = (refs: readonly GraphWalkRef[]): void => {
      const backingResources = input.backingResources;
      if (backingResources === undefined || backingResources.size === 0) {
        return;
      }

      const seen = new Set<ResourceKey>();
      for (const ref of refs) {
        const key = ref.resource.toString();
        if (seen.has(key) || !session.isUnresolved(ref.resource) || !backingResources.has(key)) {
          continue;
        }
        seen.add(key);

        const waiters = session.inheritedIslandIdsFor(ref.resource);
        const islandIds = waiters.length > 0 ? waiters : [ref.inheritedIslandId];
        session.promoteBackingHits([ref]);
        removeFromLanes(key);
        expandForIslands(ref.resource, islandIds);
      }
    };

    const ingest = (refs: readonly GraphWalkRef[]): void => {
      if (refs.length === 0) {
        return;
      }

      promoteBackingForRefs(refs);

      const unmatched: GraphWalkRef[] = [];

      for (const ref of refs) {
        if (session.contentMap.has(ref.resource)) {
          // Backing promotion already expanded all waiters; this covers already-resolved
          // resources discovered from a new island context.
          ingest(session.expand(ref));
          continue;
        }

        if (session.hasFailure(ref.resource)) {
          session.registerMissing(ref);
          continue;
        }

        if (session.isInFlight(ref.resource)) {
          continue;
        }

        const key = ref.resource.toString();
        if (isOnAnyLane(key)) {
          continue;
        }

        if (!session.isQueued(ref.resource) && !session.isUnresolved(ref.resource)) {
          continue;
        }

        const loaderIndex = this.loaders.findIndex((loader) => loader.accepts(ref.resource));
        if (loaderIndex < 0) {
          unmatched.push(ref);
          continue;
        }

        const lane = lanes[loaderIndex]!;
        lane.frontier.push(ref);
        lane.frontierKeys.add(key);
      }

      if (unmatched.length > 0) {
        session.failUnhandledIfEmptyTake(unmatched);
      }
    };

    const startLane = (laneIndex: number): void => {
      const lane = lanes[laneIndex]!;
      const taken: GraphWalkRef[] = [];
      const takenKeys = new Set<ResourceKey>();

      const pull: DataResolutionPull = {
        signal: session.signal,
        take: (accept: (resource: ApplicationResourceIdentifier) => boolean, limit?: number) => {
          const batch: ApplicationResourceIdentifier[] = [];
          const max = limit === undefined ? Number.POSITIVE_INFINITY : limit;
          if (max <= 0) {
            return batch;
          }

          const remaining: GraphWalkRef[] = [];
          for (const item of lane.frontier) {
            const key = item.resource.toString();
            const canTake =
              batch.length < max &&
              accept(item.resource) &&
              session.isUnresolved(item.resource) &&
              !takenKeys.has(key);

            if (canTake) {
              taken.push(item);
              takenKeys.add(key);
              lane.frontierKeys.delete(key);
              session.markInFlight(item.resource);
              batch.push(item.resource);
            } else {
              remaining.push(item);
            }
          }

          lane.frontier = remaining;
          return batch;
        },
      };

      lane.inFlight = lane.loader.process(pull).then(
        (records) => ({ ok: true as const, laneIndex, taken, records }),
        (error: unknown) => ({ ok: false as const, laneIndex, taken, error })
      );
    };

    const settleMissing = (item: GraphWalkRef): void => {
      const waiters = session.inheritedIslandIdsFor(item.resource);
      const islands = waiters.length > 0 ? waiters : [item.inheritedIslandId];

      for (const inheritedIslandId of islands) {
        session.registerMissing({ resource: item.resource, inheritedIslandId });
      }
    };

    const observeRemainingInFlight = async (): Promise<void> => {
      const others = lanes
        .map((entry) => entry.inFlight)
        .filter((promise): promise is Promise<LaneCompletion<R>> => promise !== null)
        .map((promise) =>
          promise.then(
            () => undefined,
            () => undefined
          )
        );
      await Promise.all(others);
      for (const entry of lanes) {
        entry.inFlight = null;
      }
    };

    const handleCompletion = async (completion: LaneCompletion<R>): Promise<void> => {
      const lane = lanes[completion.laneIndex]!;
      lane.inFlight = null;

      if (!completion.ok) {
        await observeRemainingInFlight();
        throw completion.error;
      }

      try {
        session.assertNotAborted();

        const { taken, records } = completion;

        if (taken.length === 0) {
          session.failUnhandledIfEmptyTake(lane.frontier);
          lane.frontier = [];
          lane.frontierKeys.clear();
          return;
        }

        const resolvedByKey = session.commitRecords(records);

        for (const item of taken) {
          if (resolvedByKey.has(item.resource.toString())) {
            continue;
          }
          session.throwIfMissingTaken(item);
        }

        for (const item of taken) {
          if (!session.contentMap.has(item.resource)) {
            settleMissing(item);
            continue;
          }

          const waiters = session.settle(item.resource);
          const islandIds = waiters.length > 0 ? waiters : [item.inheritedIslandId];
          expandForIslands(item.resource, islandIds);
        }
      } catch (error) {
        await observeRemainingInFlight();
        throw error;
      }
    };

    const rootRef: GraphWalkRef = {
      resource: input.root,
      inheritedIslandId: input.root.toString(),
    };
    session.rememberWaiter(rootRef);
    ingest([rootRef]);

    while (true) {
      session.assertNotAborted();

      for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
        const lane = lanes[laneIndex]!;
        if (lane.inFlight !== null || lane.frontier.length === 0) {
          continue;
        }

        promoteBackingForRefs(lane.frontier);
        if (lane.frontier.length === 0) {
          continue;
        }

        startLane(laneIndex);
      }

      const pending = lanes
        .map((lane) => lane.inFlight)
        .filter((promise): promise is Promise<LaneCompletion<R>> => promise !== null);

      if (pending.length === 0) {
        break;
      }

      const completion = await Promise.race(pending);
      await handleCompletion(completion);
    }

    session.assertNotAborted();
    return session.toOutput();
  }
}
