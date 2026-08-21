import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import { ContentMap } from "./content-map";
import type { DataResolutionPort } from "./data-resolution-port";
import type { ExpansionPort } from "./expansion-port";
import { IslandDependencyMap } from "./island-dependency-map";
import { IslandMap } from "./island-map";
import type {
  IslandId,
  ResolutionError,
  ResolveContentTreeInput,
  ResolveContentTreeOutput,
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

/** Collects unique frontier resources that still need a data-port resolve. */
function resourcesToResolve(
  frontier: readonly QueueItem[],
  contentMap: ContentMap,
  failuresByResource: ReadonlyMap<ResourceKey, FailureAccumulator>
): ApplicationResourceIdentifier[] {
  const missing: ApplicationResourceIdentifier[] = [];
  const seen = new Set<ResourceKey>();

  for (const { resource } of frontier) {
    const key = resource.format();

    if (seen.has(key) || contentMap.has(resource) || failuresByResource.has(key)) {
      continue;
    }

    seen.add(key);
    missing.push(resource);
  }

  return missing;
}

/**
 * Resolves a content resource graph from a root ARI using frontier batching,
 * island ownership, and configurable missing-resource handling.
 */
export class ResolveContentTreeUseCase<TExecutionContext = unknown> {
  constructor(
    private readonly dataResolutionPort: DataResolutionPort,
    private readonly expansionPort: ExpansionPort<TExecutionContext>
  ) {}

  async execute(
    input: ResolveContentTreeInput<TExecutionContext>
  ): Promise<ResolveContentTreeOutput> {
    const contentMap = new ContentMap();
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
      const missingResources = resourcesToResolve(frontier, contentMap, failuresByResource);

      if (missingResources.length > 0) {
        const resolved = await this.dataResolutionPort.resolve(missingResources);

        for (const resource of missingResources) {
          const resourceKey = resource.format();

          if (resolved.has(resourceKey)) {
            contentMap.set(resource, resolved.get(resourceKey));
            continue;
          }

          if (input.missingResourceMode === "throw") {
            throw new Error(`Unable to resolve ${resourceKey}`);
          }
        }
      }

      for (const { resource, inheritedIslandId } of frontier) {
        if (!contentMap.has(resource)) {
          registerMissingResource(resource, inheritedIslandId);
          continue;
        }

        const resourceKey = resource.format();

        const expansion = this.expansionPort.expand({
          resource,
          contentMap,
          inheritedIslandId,
          executionContext: input.context,
        });

        const islandId = expansion.isIsland ? resourceKey : inheritedIslandId;

        if (islandId !== inheritedIslandId) {
          islandDependencies.add(inheritedIslandId, islandId);
        }

        if (islands.has(islandId, resource)) {
          continue;
        }

        islands.add(islandId, resource);

        for (const child of expansion.resources) {
          queue.push({
            resource: child,
            inheritedIslandId: islandId,
          });
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
