import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { ContentRegistry, IslandId, RegistryPayloadFor } from "../types";
import type { ExpansionContext, ExpansionResourceFor } from "./expansion-port";

/**
 * Everything an island policy may observe: the resource, its own payload, and the
 * execution context.
 *
 * Same scope as {@link ExpansionContext} — policies must not observe siblings,
 * traversal island, or batch peers.
 */
export type IslandContext<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
  Resource extends ApplicationResourceIdentifier = ApplicationResourceIdentifier,
> = ExpansionContext<R, TExecutionContext, Resource>;

export interface IslandResult {
  readonly startIsland: boolean;
  /** When omitted and {@link startIsland} is true, the resource key becomes the island id. */
  readonly islandId?: IslandId;
}

export type IslandBoundary =
  | false
  | true
  | void
  | IslandId
  | {
      readonly islandId?: IslandId;
    };

/**
 * Application boundary that decides whether a resolved resource opens a new island.
 */
export interface IslandPort<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  resolve(context: IslandContext<R, TExecutionContext>): IslandResult;
}

export interface IslandPolicy<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  matches(context: IslandContext<R, TExecutionContext>): boolean;
  resolve(context: IslandContext<R, TExecutionContext>): IslandResult;
}

function normalizeIslandBoundary(boundary: IslandBoundary): IslandResult {
  if (boundary === false) {
    return { startIsland: false };
  }

  if (boundary === true) {
    return { startIsland: true };
  }

  if (typeof boundary === "string") {
    return { startIsland: true, islandId: boundary };
  }

  if (boundary !== undefined && typeof boundary === "object" && "islandId" in boundary) {
    return boundary.islandId === undefined
      ? { startIsland: true }
      : { startIsland: true, islandId: boundary.islandId };
  }

  return { startIsland: true };
}

/**
 * Author an island policy:
 * - `for` — initial resource filter + narrowing
 * - `when` — optional refine on the narrowed context
 * - `startIsland` — when matched, whether to open a boundary and with which id
 */
export function defineIslandPolicy<
  Resource extends ApplicationResourceIdentifier,
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
>(policy: {
  for: ExpansionResourceFor<Resource>;
  when?: (context: IslandContext<R, TExecutionContext, Resource>) => boolean;
  startIsland: (context: IslandContext<R, TExecutionContext, Resource>) => IslandBoundary;
}): IslandPolicy<R, TExecutionContext> {
  const { for: forResource, when, startIsland } = policy;

  return {
    matches(
      context: IslandContext<R, TExecutionContext>
    ): context is IslandContext<R, TExecutionContext, Resource> {
      if (!forResource.matches(context.resource)) {
        return false;
      }

      const narrowed = context as IslandContext<R, TExecutionContext, Resource>;
      return when ? when(narrowed) : true;
    },
    resolve(context: IslandContext<R, TExecutionContext>) {
      return normalizeIslandBoundary(
        startIsland(context as IslandContext<R, TExecutionContext, Resource>)
      );
    },
  };
}

const NO_ISLAND: IslandResult = { startIsland: false };

/**
 * Builds an {@link IslandPort} that OR-combines every matching policy.
 * When several policies match, any `startIsland: true` opens a boundary; the first
 * explicit `islandId` wins.
 */
export function createIslandPolicyChain<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
>(policies: readonly IslandPolicy<R, TExecutionContext>[]): IslandPort<R, TExecutionContext> {
  return {
    resolve(context) {
      let shouldStart = false;
      let islandId: IslandId | undefined;

      for (const policy of policies) {
        if (!policy.matches(context)) {
          continue;
        }

        const result = policy.resolve(context);
        if (!result.startIsland) {
          continue;
        }

        shouldStart = true;
        if (result.islandId !== undefined && islandId === undefined) {
          islandId = result.islandId;
        }
      }

      return shouldStart ? { startIsland: true, islandId } : NO_ISLAND;
    },
  };
}
