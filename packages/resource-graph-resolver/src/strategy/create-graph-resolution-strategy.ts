import type { ApplicationResourceIdentifier } from "@xndrjs/application-resources";

import {
  createExpansionPolicyChain,
  defineExpansionPolicy,
  type ExpansionContext,
  type ExpansionPolicy,
  type ExpansionPort,
  type ExpansionResourceFor,
  type ExpansionResult,
} from "../ports/expansion-port";
import {
  createIslandPolicyChain,
  defineIslandPolicy,
  type IslandBoundary,
  type IslandContext,
  type IslandPolicy,
  type IslandPort,
} from "../ports/island-port";
import type { ContentRegistry } from "../types";

export interface GraphResolutionStrategy<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  readonly expansion: ExpansionPort<R, TExecutionContext>;
  readonly islands: IslandPort<R, TExecutionContext>;
}

export interface GraphResolutionStrategyBuilder<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  readonly expansion: ExpansionActions<R, TExecutionContext>;
  readonly islands: IslandActions<R, TExecutionContext>;
  build(): GraphResolutionStrategy<R, TExecutionContext>;
}

class ExpansionClauseBuilder<
  R extends ContentRegistry,
  TExecutionContext,
  Resource extends ApplicationResourceIdentifier,
> {
  private whenPredicate?: (context: ExpansionContext<R, TExecutionContext, Resource>) => boolean;

  constructor(
    private readonly registerPolicy: (policy: ExpansionPolicy<R, TExecutionContext>) => void,
    private readonly getBuilder: () => GraphResolutionStrategyBuilder<R, TExecutionContext>,
    private readonly forResource: ExpansionResourceFor<Resource>
  ) {}

  when(predicate: (context: ExpansionContext<R, TExecutionContext, Resource>) => boolean): this {
    this.whenPredicate = predicate;
    return this;
  }

  expand(
    expand: (context: ExpansionContext<R, TExecutionContext, Resource>) => ExpansionResult
  ): GraphResolutionStrategyBuilder<R, TExecutionContext> {
    this.registerPolicy(
      defineExpansionPolicy({
        for: this.forResource,
        ...(this.whenPredicate === undefined ? {} : { when: this.whenPredicate }),
        expand,
      })
    );

    return this.getBuilder();
  }
}

class IslandClauseBuilder<
  R extends ContentRegistry,
  TExecutionContext,
  Resource extends ApplicationResourceIdentifier,
> {
  private whenPredicate?: (context: IslandContext<R, TExecutionContext, Resource>) => boolean;

  constructor(
    private readonly registerPolicy: (policy: IslandPolicy<R, TExecutionContext>) => void,
    private readonly getBuilder: () => GraphResolutionStrategyBuilder<R, TExecutionContext>,
    private readonly forResource: ExpansionResourceFor<Resource>
  ) {}

  when(predicate: (context: IslandContext<R, TExecutionContext, Resource>) => boolean): this {
    this.whenPredicate = predicate;
    return this;
  }

  startIsland(
    boundary:
      | IslandBoundary
      | ((context: IslandContext<R, TExecutionContext, Resource>) => IslandBoundary) = true
  ): GraphResolutionStrategyBuilder<R, TExecutionContext> {
    const resolveBoundary = typeof boundary === "function" ? boundary : () => boundary;

    this.registerPolicy(
      defineIslandPolicy({
        for: this.forResource,
        ...(this.whenPredicate === undefined ? {} : { when: this.whenPredicate }),
        startIsland: resolveBoundary,
      })
    );

    return this.getBuilder();
  }
}

class ExpansionActions<R extends ContentRegistry, TExecutionContext> {
  constructor(
    private readonly registerPolicy: (policy: ExpansionPolicy<R, TExecutionContext>) => void,
    private readonly getBuilder: () => GraphResolutionStrategyBuilder<R, TExecutionContext>
  ) {}

  on<Resource extends ApplicationResourceIdentifier>(
    forResource: ExpansionResourceFor<Resource>
  ): ExpansionClauseBuilder<R, TExecutionContext, Resource> {
    return new ExpansionClauseBuilder(this.registerPolicy, this.getBuilder, forResource);
  }
}

class IslandActions<R extends ContentRegistry, TExecutionContext> {
  constructor(
    private readonly registerPolicy: (policy: IslandPolicy<R, TExecutionContext>) => void,
    private readonly getBuilder: () => GraphResolutionStrategyBuilder<R, TExecutionContext>
  ) {}

  on<Resource extends ApplicationResourceIdentifier>(
    forResource: ExpansionResourceFor<Resource>
  ): IslandClauseBuilder<R, TExecutionContext, Resource> {
    return new IslandClauseBuilder(this.registerPolicy, this.getBuilder, forResource);
  }
}

/**
 * Starts a graph resolution strategy with separate `expansion` and `islands` namespaces.
 * Each `.expand()` / `.startIsland()` registers one policy and returns the builder.
 */
export function createGraphResolutionStrategy<
  TExecutionContext = unknown,
  R extends ContentRegistry = ContentRegistry,
>(): GraphResolutionStrategyBuilder<R, TExecutionContext> {
  const expansionPolicies: ExpansionPolicy<R, TExecutionContext>[] = [];
  const islandPolicies: IslandPolicy<R, TExecutionContext>[] = [];

  const owner = {} as GraphResolutionStrategyBuilder<R, TExecutionContext>;

  Object.assign(owner, {
    expansion: new ExpansionActions(
      (policy) => {
        expansionPolicies.push(policy);
      },
      () => owner
    ),
    islands: new IslandActions(
      (policy) => {
        islandPolicies.push(policy);
      },
      () => owner
    ),
    build() {
      return {
        expansion: createExpansionPolicyChain(expansionPolicies),
        islands: createIslandPolicyChain(islandPolicies),
      };
    },
  } satisfies GraphResolutionStrategyBuilder<R, TExecutionContext>);

  return owner;
}
