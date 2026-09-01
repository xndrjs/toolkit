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

export interface GraphStrategy<
  R extends ContentRegistry = ContentRegistry,
  TExecutionContext = unknown,
> {
  readonly expansion: ExpansionPort<R, TExecutionContext>;
  readonly islands: IslandPort<R, TExecutionContext>;
}

class ExpansionClauseBuilder<
  R extends ContentRegistry,
  TExecutionContext,
  Resource extends ApplicationResourceIdentifier,
> {
  private whenPredicate?: (context: ExpansionContext<R, TExecutionContext, Resource>) => boolean;

  constructor(
    private readonly strategy: StrategyBuilder<R, TExecutionContext>,
    private readonly forResource: ExpansionResourceFor<Resource>
  ) {}

  when(predicate: (context: ExpansionContext<R, TExecutionContext, Resource>) => boolean): this {
    this.whenPredicate = predicate;
    return this;
  }

  expand(
    expand: (context: ExpansionContext<R, TExecutionContext, Resource>) => ExpansionResult
  ): StrategyBuilder<R, TExecutionContext> {
    this.strategy.addExpansionPolicy(
      defineExpansionPolicy({
        for: this.forResource,
        ...(this.whenPredicate === undefined ? {} : { when: this.whenPredicate }),
        expand,
      })
    );

    return this.strategy;
  }
}

class IslandClauseBuilder<
  R extends ContentRegistry,
  TExecutionContext,
  Resource extends ApplicationResourceIdentifier,
> {
  private whenPredicate?: (context: IslandContext<R, TExecutionContext, Resource>) => boolean;

  constructor(
    private readonly strategy: StrategyBuilder<R, TExecutionContext>,
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
  ): StrategyBuilder<R, TExecutionContext> {
    const resolveBoundary = typeof boundary === "function" ? boundary : () => boundary;

    this.strategy.addIslandPolicy(
      defineIslandPolicy({
        for: this.forResource,
        ...(this.whenPredicate === undefined ? {} : { when: this.whenPredicate }),
        startIsland: resolveBoundary,
      })
    );

    return this.strategy;
  }
}

class ExpansionActions<R extends ContentRegistry, TExecutionContext> {
  constructor(private readonly strategy: StrategyBuilder<R, TExecutionContext>) {}

  on<Resource extends ApplicationResourceIdentifier>(
    forResource: ExpansionResourceFor<Resource>
  ): ExpansionClauseBuilder<R, TExecutionContext, Resource> {
    return new ExpansionClauseBuilder(this.strategy, forResource);
  }
}

class IslandActions<R extends ContentRegistry, TExecutionContext> {
  constructor(private readonly strategy: StrategyBuilder<R, TExecutionContext>) {}

  on<Resource extends ApplicationResourceIdentifier>(
    forResource: ExpansionResourceFor<Resource>
  ): IslandClauseBuilder<R, TExecutionContext, Resource> {
    return new IslandClauseBuilder(this.strategy, forResource);
  }
}

class StrategyBuilder<R extends ContentRegistry, TExecutionContext> {
  private readonly expansionPolicies: ExpansionPolicy<R, TExecutionContext>[] = [];
  private readonly islandPolicies: IslandPolicy<R, TExecutionContext>[] = [];

  readonly expansion = new ExpansionActions(this);
  readonly islands = new IslandActions(this);

  addExpansionPolicy(policy: ExpansionPolicy<R, TExecutionContext>): void {
    this.expansionPolicies.push(policy);
  }

  addIslandPolicy(policy: IslandPolicy<R, TExecutionContext>): void {
    this.islandPolicies.push(policy);
  }

  build(): GraphStrategy<R, TExecutionContext> {
    return {
      expansion: createExpansionPolicyChain(this.expansionPolicies),
      islands: createIslandPolicyChain(this.islandPolicies),
    };
  }
}

/**
 * Starts a graph strategy with separate `expansion` and `islands` namespaces.
 * Each `.expand()` / `.startIsland()` registers one policy and returns the builder.
 */
export function createStrategy<
  TExecutionContext = unknown,
  R extends ContentRegistry = ContentRegistry,
>(): StrategyBuilder<R, TExecutionContext> {
  return new StrategyBuilder<R, TExecutionContext>();
}
