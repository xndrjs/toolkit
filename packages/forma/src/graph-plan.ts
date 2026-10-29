import type { Intent } from "./boundary.js";
import { intentIdentity } from "./boundary.js";
import type { Provider } from "./provider.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- erasure shared with compose
type AnyProvider = Provider<string, string, any, any, any, any, boolean>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- erasure shared with compose
type AnyIntent = Intent<string, string, any, any, any>;

/** Display label for diagnostics (not the identity key). */
function intentLabel(intent: { readonly boundaryId: string; readonly name: string }): string {
  return `${intent.boundaryId}.${intent.name}`;
}

/** Unambiguous runtime map key — same encoding as compose. */
function intentMapKey(intent: { readonly boundaryId: string; readonly name: string }): string {
  return JSON.stringify(intentIdentity(intent));
}

/**
 * Static execution plan for a Composition: Intent nodes and dependency edges
 * (provider `using` + Binding rewrites). Validated at `compose` for cycles and
 * a closed graph; not yet exposed via `describePlan`.
 */
export type ExecutionPlan = {
  /** Intent map key → display label (`boundaryId.name`). */
  readonly labels: ReadonlyMap<string, string>;
  /** Adjacency: dependent Intent key → keys it requires (using and/or binding). */
  readonly adjacency: ReadonlyMap<string, ReadonlySet<string>>;
};

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
 * - Binding: required Intent → satisfier Intent
 *
 * Together these include Binding-mediated cycles (e.g. A uses B, bind(B, A)).
 */
export function buildExecutionPlan(
  registry: ReadonlyMap<string, AnyProvider>,
  bindings: readonly (readonly [AnyIntent, AnyIntent])[]
): ExecutionPlan {
  const labels = new Map<string, string>();
  const adjacency = new Map<string, Set<string>>();

  for (const [key, provider] of registry) {
    ensureNode(labels, adjacency, key, intentLabel(provider.intent));
  }

  for (const [required, satisfier] of bindings) {
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
 * Every `using` requirement (after Binding rewrite) and every Binding satisfier
 * must have a registered provider.
 */
export function assertClosedGraph(
  registry: ReadonlyMap<string, AnyProvider>,
  bindings: readonly (readonly [AnyIntent, AnyIntent])[]
): void {
  const bindingMap = new Map<string, string>();
  for (const [required, satisfier] of bindings) {
    bindingMap.set(intentMapKey(required), intentMapKey(satisfier));
  }

  for (const [, satisfier] of bindings) {
    const satisfierId = intentMapKey(satisfier);
    if (!registry.has(satisfierId)) {
      throw new Error(
        `No provider registered for Intent ${intentLabel(satisfier)} (binding satisfier). Add it to surface or wiring.`
      );
    }
  }

  for (const provider of registry.values()) {
    const deps = provider.deps as Record<string, AnyIntent>;
    for (const intent of Object.values(deps)) {
      const requiredId = intentMapKey(intent);
      const satisfierId = bindingMap.get(requiredId) ?? requiredId;
      if (!registry.has(satisfierId)) {
        const viaBinding =
          satisfierId !== requiredId
            ? ` (bound satisfier identity has no registered provider)`
            : "";
        throw new Error(
          `No provider registered for Intent ${intentLabel(intent)}${viaBinding}. Add it to surface or wiring.`
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
