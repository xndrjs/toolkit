import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { ContentMap } from "./content-map";
import type { ContentRegistry, IslandId } from "./types";

export interface ExpansionContext<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  resource: ApplicationResourceIdentifier;
  contentMap: ContentMap<R>;
  /**
   * Island inherited from the parent.
   * The resource's effective island may change when {@link ExpansionResult.isIsland} is true.
   */
  inheritedIslandId: IslandId;
  executionContext: TExecutionContext;
}

export interface ExpansionResult {
  resources: readonly ApplicationResourceIdentifier[];
  isIsland?: boolean;
}

/**
 * Application boundary that discovers child resources and island boundaries
 * for an already-resolved resource.
 */
export interface ExpansionPort<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  expand(context: ExpansionContext<R, TExecutionContext>): ExpansionResult;
}

/**
 * Pure policy for expanding a matching resource type.
 * First `matches` wins when composed via {@link createExpansionPolicyChain}.
 */
export interface ExpansionPolicy<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  matches(resource: ApplicationResourceIdentifier): boolean;
  expand(context: ExpansionContext<R, TExecutionContext>): ExpansionResult;
}

const EMPTY_EXPANSION: ExpansionResult = { resources: [] };

/**
 * Builds an {@link ExpansionPort} that applies the first matching policy.
 * When no policy matches, returns `{ resources: [] }`.
 */
export function createExpansionPolicyChain<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
>(policies: readonly ExpansionPolicy<R, TExecutionContext>[]): ExpansionPort<R, TExecutionContext> {
  return {
    expand(context) {
      for (const policy of policies) {
        if (policy.matches(context.resource)) {
          return policy.expand(context);
        }
      }

      return EMPTY_EXPANSION;
    },
  };
}
