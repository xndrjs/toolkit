import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { ContentMap } from "./content-map";
import type { ContentRegistry, IslandId } from "./types";

export interface ExpansionContext<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
  Resource extends ApplicationResourceIdentifier = ApplicationResourceIdentifier,
> {
  resource: Resource;
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
 * Chain-erased policy: `matches` is a boolean gate; `expand` sees a wide resource.
 * Prefer {@link defineExpansionPolicy} at authoring time so `expand` receives a narrowed resource.
 */
export interface ExpansionPolicy<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  matches(resource: ApplicationResourceIdentifier): boolean;
  expand(context: ExpansionContext<R, TExecutionContext>): ExpansionResult;
}

/**
 * Author a policy whose `expand` context is narrowed by the `matches` type predicate.
 * The returned value is erased to {@link ExpansionPolicy} for {@link createExpansionPolicyChain}.
 */
export function defineExpansionPolicy<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
  Resource extends ApplicationResourceIdentifier = ApplicationResourceIdentifier,
>(policy: {
  matches: (resource: ApplicationResourceIdentifier) => resource is Resource;
  expand: (context: ExpansionContext<R, TExecutionContext, Resource>) => ExpansionResult;
}): ExpansionPolicy<R, TExecutionContext>;
export function defineExpansionPolicy<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
>(policy: {
  matches: (resource: ApplicationResourceIdentifier) => boolean;
  expand: (context: ExpansionContext<R, TExecutionContext>) => ExpansionResult;
}): ExpansionPolicy<R, TExecutionContext>;
export function defineExpansionPolicy<R extends ContentRegistry, TExecutionContext>(policy: {
  matches: (resource: ApplicationResourceIdentifier) => boolean;
  expand: (context: ExpansionContext<R, TExecutionContext>) => ExpansionResult;
}): ExpansionPolicy<R, TExecutionContext> {
  return policy;
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
