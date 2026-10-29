import type { AnyIntent, AnyProvider, IntentAlias } from "./alias-intent.js";
import { intentLabel, intentMapKey } from "./intent-keys.js";
import type { LifetimePolicy } from "./provider/provider.js";

/**
 * Static execution plan for a Composition: Intent nodes and dependency edges
 * (provider `using` + Intent-alias rewrites). Validated at `compose` for cycles and
 * a closed graph, then used to derive the lifetime description exposed by `describePlan`.
 */
export type ExecutionPlan = {
  /** Intent map key → display label (`boundaryId.name`). */
  readonly labels: ReadonlyMap<string, string>;
  /** Adjacency: dependent Intent key → keys it requires (using and/or alias). */
  readonly adjacency: ReadonlyMap<string, ReadonlySet<string>>;
};

export type EffectiveLifetime = "composition" | "context";

/** Effective lifetime for one registered Provider in a resolved Composition. */
export type ProviderLifetimeResolution = {
  readonly declared: LifetimePolicy;
  readonly effective: EffectiveLifetime;
  /** Intent map keys from this Provider to the `.perContext()` cause. */
  readonly narrowedBy?: readonly string[];
};

export type ProviderLifetimePlan = ReadonlyMap<string, ProviderLifetimeResolution>;

function ensureNode(
  labels: Map<string, string>,
  adjacency: Map<string, Set<string>>,
  key: string,
  label: string
): void {
  if (!labels.has(key)) {
    labels.set(key, label);
  }
  if (!adjacency.has(key)) {
    adjacency.set(key, new Set());
  }
}

function addEdge(
  labels: Map<string, string>,
  adjacency: Map<string, Set<string>>,
  from: string,
  fromLabel: string,
  to: string,
  toLabel: string
): void {
  ensureNode(labels, adjacency, from, fromLabel);
  ensureNode(labels, adjacency, to, toLabel);
  adjacency.get(from)!.add(to);
}

/**
 * Build the composition dependency plan.
 *
 * Edges:
 * - Provider `using`: consumer Intent → required Intent (before rewrite)
 * - Intent alias: required Intent → satisfier Intent
 *
 * Together these include alias-mediated cycles (e.g. A uses B, aliasIntent(B, A)).
 */
export function buildExecutionPlan(
  registry: ReadonlyMap<string, AnyProvider>,
  aliases: readonly IntentAlias[] | readonly (readonly [AnyIntent, AnyIntent])[]
): ExecutionPlan {
  const labels = new Map<string, string>();
  const adjacency = new Map<string, Set<string>>();

  for (const [key, provider] of registry) {
    ensureNode(labels, adjacency, key, intentLabel(provider.intent));
  }

  for (const [required, satisfier] of aliases) {
    addEdge(
      labels,
      adjacency,
      intentMapKey(required),
      intentLabel(required),
      intentMapKey(satisfier),
      intentLabel(satisfier)
    );
  }

  for (const provider of registry.values()) {
    const deps = provider.deps as Record<string, AnyIntent>;
    const from = intentMapKey(provider.intent);
    const fromLabel = intentLabel(provider.intent);
    for (const intent of Object.values(deps)) {
      addEdge(labels, adjacency, from, fromLabel, intentMapKey(intent), intentLabel(intent));
    }
  }

  return { labels, adjacency };
}

/**
 * Every `using` requirement (after Intent-alias rewrite) and every alias satisfier
 * must have a registered provider.
 */
export function assertClosedGraph(
  registry: ReadonlyMap<string, AnyProvider>,
  aliases: readonly IntentAlias[] | readonly (readonly [AnyIntent, AnyIntent])[]
): void {
  const aliasMap = new Map<string, string>();
  for (const [required, satisfier] of aliases) {
    aliasMap.set(intentMapKey(required), intentMapKey(satisfier));
  }

  for (const [, satisfier] of aliases) {
    const satisfierId = intentMapKey(satisfier);
    if (!registry.has(satisfierId)) {
      throw new Error(
        `No provider registered for Intent ${intentLabel(satisfier)} (alias satisfier). Add it to surface or wiring.`
      );
    }
  }

  for (const provider of registry.values()) {
    const deps = provider.deps as Record<string, AnyIntent>;
    for (const intent of Object.values(deps)) {
      const requiredId = intentMapKey(intent);
      const satisfierId = aliasMap.get(requiredId) ?? requiredId;
      if (!registry.has(satisfierId)) {
        const viaAlias =
          satisfierId !== requiredId
            ? ` (aliased satisfier identity has no registered provider)`
            : "";
        throw new Error(
          `No provider registered for Intent ${intentLabel(intent)}${viaAlias}. Add it to surface or wiring.`
        );
      }
    }
  }
}

/**
 * Reject cyclic dependency plans. Diagnostic includes the full path:
 * `Circular dependency: orders.a -> orders.b -> orders.a`
 */
export function assertAcyclicPlan(plan: ExecutionPlan): void {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();

  for (const key of plan.labels.keys()) {
    color.set(key, WHITE);
  }
  for (const [from, tos] of plan.adjacency) {
    if (!color.has(from)) {
      color.set(from, WHITE);
    }
    for (const to of tos) {
      if (!color.has(to)) {
        color.set(to, WHITE);
      }
    }
  }

  const stack: string[] = [];

  const labelOf = (key: string): string => plan.labels.get(key) ?? key;

  const visit = (node: string): void => {
    color.set(node, GRAY);
    stack.push(node);

    for (const next of plan.adjacency.get(node) ?? []) {
      const nextColor = color.get(next) ?? WHITE;
      if (nextColor === GRAY) {
        const start = stack.indexOf(next);
        const cycle = [...stack.slice(start), next];
        throw new Error(`Circular dependency: ${cycle.map(labelOf).join(" -> ")}`);
      }
      if (nextColor === WHITE) {
        visit(next);
      }
    }

    stack.pop();
    color.set(node, BLACK);
  };

  for (const node of color.keys()) {
    if (color.get(node) === WHITE) {
      visit(node);
    }
  }
}

type NodeLifetimeResolution = {
  readonly effective: EffectiveLifetime;
  readonly path: readonly string[];
};

/**
 * Derive Provider ownership from the already-resolved, acyclic graph.
 *
 * `auto` Providers use the longest safe lifetime. Context affinity propagates
 * from dependencies to consumers. `.perComposition()` is an exact pin and
 * fails synchronously when any transitive dependency requires a context.
 */
export function resolveProviderLifetimes(
  plan: ExecutionPlan,
  registry: ReadonlyMap<string, AnyProvider>
): ProviderLifetimePlan {
  const nodes = new Map<string, NodeLifetimeResolution>();
  const visiting = new Set<string>();
  const labelOf = (key: string): string => plan.labels.get(key) ?? key;

  const resolveNode = (node: string): NodeLifetimeResolution => {
    const known = nodes.get(node);
    if (known) {
      return known;
    }
    if (visiting.has(node)) {
      throw new Error(`Circular dependency while resolving lifetimes at ${labelOf(node)}`);
    }

    visiting.add(node);
    let contextualDependency: NodeLifetimeResolution | undefined;
    for (const dependency of plan.adjacency.get(node) ?? []) {
      const resolved = resolveNode(dependency);
      if (resolved.effective === "context" && contextualDependency === undefined) {
        contextualDependency = resolved;
      }
    }

    const policy = registry.get(node)?.lifetimePolicy ?? "auto";
    let resolution: NodeLifetimeResolution;
    if (policy === "context") {
      resolution = { effective: "context", path: [node] };
    } else if (contextualDependency) {
      const path = [node, ...contextualDependency.path];
      if (policy === "composition") {
        throw new Error(
          `Lifetime conflict: ${labelOf(node)} is declared .perComposition() but depends on a .perContext() provider through ${path.map(labelOf).join(" -> ")}`
        );
      }
      resolution = { effective: "context", path };
    } else {
      resolution = { effective: "composition", path: [node] };
    }

    visiting.delete(node);
    nodes.set(node, resolution);
    return resolution;
  };

  for (const node of plan.labels.keys()) {
    resolveNode(node);
  }

  const providers = new Map<string, ProviderLifetimeResolution>();
  for (const [key, provider] of registry) {
    const resolution = resolveNode(key);
    providers.set(key, {
      declared: provider.lifetimePolicy,
      effective: resolution.effective,
      ...(provider.lifetimePolicy === "auto" && resolution.effective === "context"
        ? { narrowedBy: resolution.path }
        : {}),
    });
  }
  return providers;
}
