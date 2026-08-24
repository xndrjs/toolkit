import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import { ContentMap } from "./content-map";
import type { DataResolutionPort, DataResolutionPull } from "./data-resolution-port";
import { ResolveContentGraphAbortedError } from "./errors";
import type { ExpansionContext, ExpansionPort } from "./expansion-port";
import { IslandDependencyMap } from "./island-dependency-map";
import { IslandMap } from "./island-map";
import type {
  ContentRegistry,
  IslandId,
  ResolutionError,
  ResolveContentGraphInput,
  ResolveContentGraphOutput,
  ResolvedResourceRecord,
  ResourceKey,
} from "./types";

interface QueueItem {
  resource: ApplicationResourceIdentifier;
  inheritedIslandId: IslandId;
}

interface FailureAccumulator {
  resourceKey: ResourceKey;
  message: string;
  inheritedIslandIds: Set<IslandId>;
}

function isUnresolved<R extends ContentRegistry>(
  resource: ApplicationResourceIdentifier,
  contentMap: ContentMap<R>,
  failuresByResource: ReadonlyMap<ResourceKey, FailureAccumulator>
): boolean {
  const key = resource.toString();
  return !contentMap.has(resource) && !failuresByResource.has(key);
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new ResolveContentGraphAbortedError("Content graph resolution was aborted", {
      cause: signal.reason,
    });
  }
}

/**
 * Resolves a content resource graph from a root ARI using frontier pulls,
 * island ownership, and configurable missing-resource handling.
 *
 * Intended as a reusable engine inside project-specific application use cases.
 * Supply a {@link ContentRegistry} so resolved values are typed by ARI `type`.
 */
export class ResolveContentGraphEngine<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  constructor(
    private readonly dataResolutionPort: DataResolutionPort<R>,
    private readonly expansionPort: ExpansionPort<R, TExecutionContext>
  ) {}

  async execute(
    input: ResolveContentGraphInput<TExecutionContext>
  ): Promise<ResolveContentGraphOutput<R>> {
    const contentMap = new ContentMap<R>();
    const islands = new IslandMap();
    const islandDependencies = new IslandDependencyMap();
    const failuresByResource = new Map<ResourceKey, FailureAccumulator>();

    assertNotAborted(input.signal);

    const registerMissingResource = (
      resource: ApplicationResourceIdentifier,
      inheritedIslandId: IslandId
    ): void => {
      const resourceKey = resource.toString();

      const failure = failuresByResource.get(resourceKey) ?? {
        resourceKey,
        message: `Unable to resolve ${resourceKey}`,
        inheritedIslandIds: new Set<IslandId>(),
      };

      failure.inheritedIslandIds.add(inheritedIslandId);
      failuresByResource.set(resourceKey, failure);
    };

    const queue: QueueItem[] = [
      {
        resource: input.root,
        inheritedIslandId: input.root.toString(),
      },
    ];

    while (queue.length > 0) {
      assertNotAborted(input.signal);

      const frontier = queue.splice(0);
      const taken: QueueItem[] = [];
      const takenKeys = new Set<ResourceKey>();

      // Promote backing hits into ContentMap before deciding whether to pull.
      const backingResources = input.backingResources;
      if (backingResources !== undefined && backingResources.size > 0) {
        for (const item of frontier) {
          if (!isUnresolved(item.resource, contentMap, failuresByResource)) {
            continue;
          }

          const key = item.resource.toString();
          if (!backingResources.has(key)) {
            continue;
          }

          contentMap.set(
            item.resource as ApplicationResourceIdentifier<keyof R & string>,
            backingResources.get(key) as R[keyof R & string]
          );
          backingResources.delete(key);
        }
      }

      const needsResolve = frontier.some((item) =>
        isUnresolved(item.resource, contentMap, failuresByResource)
      );

      if (needsResolve) {
        assertNotAborted(input.signal);

        const pull: DataResolutionPull = {
          ...(input.signal !== undefined ? { signal: input.signal } : {}),
          take: (accept: (resource: ApplicationResourceIdentifier) => boolean, limit?: number) => {
            const batch: ApplicationResourceIdentifier[] = [];
            const max = limit === undefined ? Number.POSITIVE_INFINITY : limit;
            if (max <= 0) {
              return batch;
            }

            const remaining: QueueItem[] = [];
            for (const item of frontier) {
              const key = item.resource.toString();
              const canTake =
                batch.length < max &&
                accept(item.resource) &&
                isUnresolved(item.resource, contentMap, failuresByResource) &&
                !takenKeys.has(key);

              if (canTake) {
                taken.push(item);
                takenKeys.add(key);
                batch.push(item.resource);
              } else {
                remaining.push(item);
              }
            }

            frontier.length = 0;
            frontier.push(...remaining);
            return batch;
          },
        };

        const resolved = await this.dataResolutionPort.process(pull);

        assertNotAborted(input.signal);

        const resolvedByKey = new Map<ResourceKey, ResolvedResourceRecord<R>>();
        for (const record of resolved) {
          resolvedByKey.set(record.resource.toString(), record);
        }

        for (const item of taken) {
          const resourceKey = item.resource.toString();
          const record = resolvedByKey.get(resourceKey);

          if (record !== undefined) {
            contentMap.set(record.resource, record.payload);
            continue;
          }

          if (input.missingResourceMode === "throw") {
            throw new Error(`Unable to resolve ${resourceKey}`);
          }
        }

        // Port accepted nothing while unresolved work remains — not the same as
        // deferral after a non-empty take (those leftovers are re-queued below).
        if (taken.length === 0) {
          const unhandled = frontier.filter((item) =>
            isUnresolved(item.resource, contentMap, failuresByResource)
          );

          if (unhandled.length > 0) {
            if (input.missingResourceMode === "throw") {
              throw new Error(`Unable to resolve ${unhandled[0]!.resource.toString()}`);
            }

            for (const item of unhandled) {
              registerMissingResource(item.resource, item.inheritedIslandId);
            }
          }
        }
      }

      const expandItem = ({ resource, inheritedIslandId }: QueueItem): void => {
        const resourceKey = resource.toString();

        const expansion = this.expansionPort.expand({
          resource,
          payload: contentMap.getByKey(resourceKey)!,
          inheritedIslandId,
          executionContext: input.executionContext,
        } as ExpansionContext<R, TExecutionContext>);

        const islandId = expansion.isIsland ? resourceKey : inheritedIslandId;

        if (islandId !== inheritedIslandId) {
          islandDependencies.add(inheritedIslandId, islandId);
        }

        if (islands.has(islandId, resource)) {
          return;
        }

        islands.add(islandId, resource);

        for (const child of expansion.resources) {
          queue.push({
            resource: child,
            inheritedIslandId: islandId,
          });
        }
      };

      for (const item of taken) {
        if (!contentMap.has(item.resource)) {
          registerMissingResource(item.resource, item.inheritedIslandId);
          continue;
        }
        expandItem(item);
      }

      for (const item of frontier) {
        if (contentMap.has(item.resource)) {
          expandItem(item);
        } else if (failuresByResource.has(item.resource.toString())) {
          // Duplicate queue entry for an already-failed resource — aggregate islands.
          registerMissingResource(item.resource, item.inheritedIslandId);
        } else {
          // Deferred by the port (not pulled this round) — try again after expand.
          queue.push(item);
        }
      }
    }

    assertNotAborted(input.signal);

    const errors: ResolutionError[] = [...failuresByResource.values()].map((failure) => ({
      resourceKey: failure.resourceKey,
      message: failure.message,
      inheritedIslandIds: [...failure.inheritedIslandIds],
    }));

    return {
      contentMap,
      islands,
      islandDependencies,
      errors,
    };
  }
}
