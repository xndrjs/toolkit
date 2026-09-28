import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { ContentRegistry, OnFailurePolicy, RegistryPayloadFor } from "../types";

export type { OnFailurePolicy };

const ON_FAILURE_RANK: Record<OnFailurePolicy, number> = {
  setNull: 0,
  setError: 1,
  throw: 2,
};

/** Strictest-wins: `throw` > `setError` > `setNull`. */
export function stricterOnFailure(left: OnFailurePolicy, right: OnFailurePolicy): OnFailurePolicy {
  return ON_FAILURE_RANK[left] >= ON_FAILURE_RANK[right] ? left : right;
}

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
  /**
   * Failure policy for every resource in this result. Defaults to `"throw"`.
   * After a policy-chain merge, prefer {@link onFailureByKey} when policies differ.
   */
  onFailure?: OnFailurePolicy;
  /**
   * Per-resource failure policy (e.g. after merging expansion policies).
   * Takes precedence over {@link onFailure} for listed keys.
   */
  onFailureByKey?: ReadonlyMap<string, OnFailurePolicy>;
}

/**
 * Resource matcher for `createGraphResolutionStrategy().expansion.on(ari)` /
 * `.islands.on(ari)` / `.resolve.on(ari)` (e.g. an {@link import("@xndrjs/application-resources").AriFactory}).
 */
export type ExpansionResourceFor<
  Resource extends ApplicationResourceIdentifier = ApplicationResourceIdentifier,
> = {
  matches(candidate: ApplicationResourceIdentifier): candidate is Resource;
};

/**
 * Application boundary that discovers child resources for an already-resolved resource.
 */
export interface ExpansionPort<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  expand(context: ExpansionContext<R, TExecutionContext>): ExpansionResult;
}

/**
 * Internal policy shape used by `createGraphResolutionStrategy()`.
 * Every matching policy may contribute children; duplicates are removed by resource key.
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

function onFailureForResource(
  result: ExpansionResult,
  resourceKey: string,
  fallback: OnFailurePolicy = "throw"
): OnFailurePolicy {
  return result.onFailureByKey?.get(resourceKey) ?? result.onFailure ?? fallback;
}

/**
 * Builds an {@link ExpansionPort} that merges every matching policy.
 * Children are concatenated in policy order and deduplicated by `resource.toString()`.
 * Duplicate ARIs keep the strictest {@link OnFailurePolicy} (`throw` > `setError` > `setNull`).
 * When no policy matches, returns `{ resources: [] }`.
 */
export function createExpansionPolicyChain<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
>(policies: readonly ExpansionPolicy<R, TExecutionContext>[]): ExpansionPort<R, TExecutionContext> {
  return {
    expand(context) {
      const merged: ApplicationResourceIdentifier[] = [];
      const onFailureByKey = new Map<string, OnFailurePolicy>();

      for (const policy of policies) {
        if (!policy.matches(context)) {
          continue;
        }

        const result = policy.expand(context);
        for (const resource of result.resources) {
          const key = resource.toString();
          const edgePolicy = onFailureForResource(result, key);
          const existing = onFailureByKey.get(key);

          if (existing === undefined) {
            merged.push(resource);
            onFailureByKey.set(key, edgePolicy);
            continue;
          }

          onFailureByKey.set(key, stricterOnFailure(existing, edgePolicy));
        }
      }

      if (merged.length === 0) {
        return EMPTY_EXPANSION;
      }

      const uniquePolicies = new Set(onFailureByKey.values());
      if (uniquePolicies.size === 1) {
        const only = uniquePolicies.values().next().value!;
        return only === "throw" ? { resources: merged } : { resources: merged, onFailure: only };
      }

      return { resources: merged, onFailureByKey };
    },
  };
}
