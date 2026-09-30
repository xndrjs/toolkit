import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import type { ContentRegistry } from "../types";
import type { ExpansionContext, ExpansionResourceFor } from "./expansion-port";

/**
 * Everything a resolve policy may observe: the resource, its decode payload, and
 * the execution context.
 *
 * Same scope as {@link ExpansionContext}. Resolve runs after a normal payload is
 * committed (post-decode), before expansion.
 */
export type ResolveContext<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
  Resource extends ApplicationResourceIdentifier = ApplicationResourceIdentifier,
> = ExpansionContext<R, TExecutionContext, Resource>;

/**
 * Redirect target for the current resource. The engine registers and
 * canonicalizes `current → resource`, then enqueues the final target without
 * expanding the locator.
 */
export interface ResolveResult {
  readonly resource: ApplicationResourceIdentifier;
}

/**
 * Application boundary that settles a decoded resource via an in-memory redirect.
 */
export interface ResolvePort<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  /**
   * First matching policy wins. `undefined` means no redirect — expand as usual.
   */
  resolve(context: ResolveContext<R, TExecutionContext>): ResolveResult | undefined;
}

/**
 * Internal policy shape used by `createGraphResolutionStrategy()`.
 */
export interface ResolvePolicy<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  matches(context: ResolveContext<R, TExecutionContext>): boolean;
  resolve(context: ResolveContext<R, TExecutionContext>): ResolveResult;
}

/**
 * Author a resolve policy:
 * - `for` — initial resource filter + narrowing
 * - `when` — optional refine on the decode payload (resource already narrowed by `for`)
 * - `to` — canonical ARI to enqueue for matched resources
 */
export function defineResolvePolicy<
  Resource extends ApplicationResourceIdentifier,
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
>(policy: {
  for: ExpansionResourceFor<Resource>;
  when?: (context: ResolveContext<R, TExecutionContext, Resource>) => boolean;
  to: (context: ResolveContext<R, TExecutionContext, Resource>) => ResolveResult;
}): ResolvePolicy<R, TExecutionContext> {
  const { for: forResource, when, to } = policy;

  return {
    matches(
      context: ResolveContext<R, TExecutionContext>
    ): context is ResolveContext<R, TExecutionContext, Resource> {
      if (!forResource.matches(context.resource)) {
        return false;
      }

      const narrowed = context as ResolveContext<R, TExecutionContext, Resource>;
      return when ? when(narrowed) : true;
    },
    resolve(context: ResolveContext<R, TExecutionContext>) {
      return to(context as ResolveContext<R, TExecutionContext, Resource>);
    },
  };
}

/**
 * Builds a {@link ResolvePort} that takes the first matching policy.
 * When no policy matches, returns `undefined` (no redirect).
 */
export function createResolvePolicyChain<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
>(policies: readonly ResolvePolicy<R, TExecutionContext>[]): ResolvePort<R, TExecutionContext> {
  return {
    resolve(context) {
      for (const policy of policies) {
        if (!policy.matches(context)) {
          continue;
        }

        return policy.resolve(context);
      }

      return undefined;
    },
  };
}
