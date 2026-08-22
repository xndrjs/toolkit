import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import { ContentMap } from "./content-map";
import type { DataResolutionPort } from "./data-resolution-port";
import type { ExpansionPort } from "./expansion-port";
import { IslandDependencyMap } from "./island-dependency-map";
import { IslandMap } from "./island-map";
import type {
  ContentRegistry,
  IslandId,
  ResolutionError,
  ResolveContentGraphInput,
  ResolveContentGraphOutput,
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
  const key = resource.format();
  return !contentMap.has(resource) && !failuresByResource.has(key);
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

    const registerMissingResource = (
      resource: ApplicationResourceIdentifier,
      inheritedIslandId: IslandId
    ): void => {
      const resourceKey = resource.format();

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
        inheritedIslandId: input.root.format(),
      },
    ];

    while (queue.length > 0) {
      const frontier = queue.splice(0);
      const taken: QueueItem[] = [];
      const takenKeys = new Set<ResourceKey>();

      // Promote backing hits into ContentMap before deciding whether to pull.
      const resolvedResourceCache = input.resolvedResourceCache;
      if (resolvedResourceCache !== undefined && resolvedResourceCache.size > 0) {
        for (const item of frontier) {
          if (!isUnresolved(item.resource, contentMap, failuresByResource)) {
            continue;
          }

          const key = item.resource.format();
          if (!resolvedResourceCache.has(key)) {
            continue;
          }

          contentMap.set(
            item.resource as ApplicationResourceIdentifier<keyof R & string>,
            resolvedResourceCache.get(key) as R[keyof R & string]
          );
          resolvedResourceCache.delete(key);
        }
      }

      const needsResolve = frontier.some((item) =>
        isUnresolved(item.resource, contentMap, failuresByResource)
      );

      if (needsResolve) {
        const resolved = await this.dataResolutionPort.process({
          take: (accept: (resource: ApplicationResourceIdentifier) => boolean, limit?: number) => {
            const batch: ApplicationResourceIdentifier[] = [];
            const max = limit === undefined ? Number.POSITIVE_INFINITY : limit;
            if (max <= 0) {
              return batch;
            }

            for (let i = 0; i < frontier.length; ) {
              if (batch.length >= max) {
                break;
              }

              const item = frontier[i]!;
              if (
                !accept(item.resource) ||
                !isUnresolved(item.resource, contentMap, failuresByResource)
              ) {
                i++;
                continue;
              }

              const key = item.resource.format();
              if (takenKeys.has(key)) {
                i++;
                continue;
              }

              frontier.splice(i, 1);
              taken.push(item);
              takenKeys.add(key);
              batch.push(item.resource);
            }

            return batch;
          },
        });

        for (const item of taken) {
          const resourceKey = item.resource.format();

          if (resolved.has(resourceKey)) {
            contentMap.set(
              item.resource as ApplicationResourceIdentifier<keyof R & string>,
              resolved.get(resourceKey) as R[keyof R & string]
            );
            continue;
          }

          if (input.missingResourceMode === "throw") {
            throw new Error(`Unable to resolve ${resourceKey}`);
          }
        }
      }

      const expandItem = ({ resource, inheritedIslandId }: QueueItem): void => {
        const resourceKey = resource.format();

        const expansion = this.expansionPort.expand({
          resource,
          contentMap,
          inheritedIslandId,
          executionContext: input.executionContext,
        });

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
        } else if (failuresByResource.has(item.resource.format())) {
          // Duplicate queue entry for an already-failed resource — aggregate islands.
          registerMissingResource(item.resource, item.inheritedIslandId);
        } else {
          // Deferred by the port (not pulled this round) — try again after expand.
          queue.push(item);
        }
      }
    }

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
