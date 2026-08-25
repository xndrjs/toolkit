import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { ContentRegistry, RegistryPayloadFor } from "../types";

/**
 * Everything a policy may observe: the resource, its own payload, and the
 * execution context.
 *
 * Deliberately excludes the island the resource was reached from. A resource may
 * be reached from several islands, and a policy that varied its output per island
 * would make expansion non-deterministic: the edges of the graph would depend on
 * traversal order rather than on content. The resolver still tracks full
 * multi-island membership; policies just do not participate in it.
 */
export interface ExpansionContext<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
  Resource extends ApplicationResourceIdentifier = ApplicationResourceIdentifier,
> {
  resource: Resource;
  /** Resolved payload for {@link resource} — policies must not observe other nodes. */
  payload: RegistryPayloadFor<R, Resource>;
  executionContext: TExecutionContext;
}

export interface ExpansionResult {
  resources: readonly ApplicationResourceIdentifier[];
  isIsland?: boolean;
}

/**
 * Resource matcher for {@link defineExpansionPolicy} `for` (e.g. an {@link import("@xndrjs/application-resources").AriFactory}).
 */
export type ExpansionResourceFor<
  Resource extends ApplicationResourceIdentifier = ApplicationResourceIdentifier,
> = {
  matches(candidate: ApplicationResourceIdentifier): candidate is Resource;
};

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
 * Chain-erased policy: `matches` is a boolean gate (first match wins); `expand` runs only when matched.
 * Both receive the same {@link ExpansionContext}, including {@link ExpansionContext.executionContext}.
 * Prefer {@link defineExpansionPolicy} at authoring time so `expand` receives a narrowed resource.
 */
export interface ExpansionPolicy<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  matches(context: ExpansionContext<R, TExecutionContext>): boolean;
  expand(context: ExpansionContext<R, TExecutionContext>): ExpansionResult;
}

/**
 * Author an expansion policy:
 * - `for` — initial resource filter + narrowing (e.g. `cmsEntryAri`)
 * - `when` — optional refine on the full context (resource already narrowed by `for`)
 * - `expand` — child discovery for matched resources
 */
export function defineExpansionPolicy<
  Resource extends ApplicationResourceIdentifier,
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
>(policy: {
  for: ExpansionResourceFor<Resource>;
  when?: (context: ExpansionContext<R, TExecutionContext, Resource>) => boolean;
  expand: (context: ExpansionContext<R, TExecutionContext, Resource>) => ExpansionResult;
}): ExpansionPolicy<R, TExecutionContext> {
  const { for: forResource, when, expand } = policy;

  return {
    matches(
      context: ExpansionContext<R, TExecutionContext>
    ): context is ExpansionContext<R, TExecutionContext, Resource> {
      if (!forResource.matches(context.resource)) {
        return false;
      }

      const narrowed = context as ExpansionContext<R, TExecutionContext, Resource>;
      return when ? when(narrowed) : true;
    },
    expand(context: ExpansionContext<R, TExecutionContext>) {
      return expand(context as ExpansionContext<R, TExecutionContext, Resource>);
    },
  };
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
        if (policy.matches(context)) {
          return policy.expand(context);
        }
      }

      return EMPTY_EXPANSION;
    },
  };
}
