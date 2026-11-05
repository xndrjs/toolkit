---
title: Inspection and testing
description: Inspect compiled plans, test through public compositions, validate the published package, and understand current guarantees.
---

Forma deliberately makes the graph inspectable without making it mutable. Tests exercise Providers
through a Composition and use `describePlan()` when architecture itself is the subject under test.

## Inspect a plan without materializing it

```ts
const plan = root.describePlan();
```

The description contains:

- declared Entry Boundary ids;
- every Surface alias, Intent identity, and root origin;
- every registered Provider's Intent identity;
- unary or stream modality;
- Boundary or Adapter origin;
- declared and effective lifetime;
- the narrowing path for an `auto` Provider made context-effective by its graph.

```ts
for (const provider of plan.providers) {
  console.log({
    intent: provider.intent,
    mode: provider.mode,
    origin: provider.origin,
    lifetime: provider.lifetime,
  });
}
```

The returned data is frozen diagnostic metadata. Reading it does not run factories or expose
operations.

Useful architecture assertions include:

```ts
expect(plan.entryBoundaries).toEqual(["orders"]);

expect(plan.surface).toContainEqual({
  alias: "getOrderDetails",
  intent: ["orders", "getOrderDetailsUseCase"],
  origin: { kind: "boundary", id: "orders" },
});

expect(plan.providers).toContainEqual(
  expect.objectContaining({
    intent: ["orders", "watchOrderEventsUseCase"],
    mode: "stream",
  })
);
```

## Test behavior through the Surface

Provider realization is internal. Do not call, replace, or monkey-patch a `provider.factory`:
there is no public factory field.

Compose the smallest closed graph that represents the behavior under test:

```ts
const root = compose({
  entryBoundaries: [Orders],
  surface: { getOrderDetails: GetOrderDetailsProvider },
  wiring: [FindOrderViaMemoryProvider],
});

try {
  const outcome = await root.withExecutionContext((surface) => surface.getOrderDetails("42"), {
    params: { role: "viewer" },
  });

  expect(outcome).toEqual({
    kind: "success",
    value: { id: "42", total: 100 },
  });
} finally {
  await root.dispose();
}
```

Counters, gates, failures, and cleanup observations belong inside test Provider callbacks and are
observed through invocation and disposal. This tests the same lazy materialization and ownership
path used by production code.

## Replace realizations at Composition time

The Orders demo exposes the same Surface through two graphs:

```ts
const memoryRoot = compose({
  entryBoundaries: [Orders],
  surface: {
    getOrderDetails: GetOrderDetailsProvider,
    watchOrderEvents: WatchOrderEventsProvider,
  },
  wiring: [FindOrderViaMemoryProvider, WatchOrderEventsViaMemoryProvider],
});

const sqliteRoot = compose({
  entryBoundaries: [Orders],
  surface: {
    getOrderDetails: GetOrderDetailsProvider,
    watchOrderEvents: WatchOrderEventsProvider,
  },
  wiring: [
    FindOrderViaSqliteProvider,
    WatchOrderEventsViaSqliteProvider,
    SelectOrderProvider,
    SelectOrderEventsProvider,
    DatabaseProvider,
  ],
});
```

Tests can run the same behavioral contract against both roots. The public Orders Contract does not
know which storage Boundary closes its seams.

## Static and runtime checks

TypeScript provides early, local diagnostics where it can preserve exact tuple and literal types.
Runtime validation remains authoritative for JavaScript callers, casts, prototype checks, and graph
properties that TypeScript cannot reliably prove.

| Invariant                                         | Static check                               | Runtime check                                                    |
| ------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| Boundary-owned `using` stays in the same Boundary | Yes                                        | No dedicated same-Boundary check after a cast                    |
| Adapter adapts an Intent of its target Boundary   | Yes                                        | Target authenticity only; target/Intent correspondence is static |
| Missing providers after alias rewriting           | Yes with precise tuples                    | Yes                                                              |
| Contract compatibility across resolved edges      | Yes for Input, Success/Item, Err, modality | Reified modality                                                 |
| Entry Boundary and Surface origin correspondence  | Yes with precise origins                   | Yes                                                              |
| Competing realization or duplicate alias          | Best effort                                | Yes                                                              |
| Cyclic graph                                      | No general type-level proof                | Yes, with full path                                              |
| Transitive effective lifetime                     | Limited local checks                       | Yes, with causal path                                            |
| Params type conflicts                             | Yes                                        | Host bag shape and properties                                    |
| Protocol authenticity                             | Nominal public types                       | Versioned runtime brands                                         |

Runtime brands identify values created by a compatible Forma protocol implementation. They prevent
ordinary structural lookalikes and spread clones from entering the graph; they are not a security
boundary.

## Run the focused demos

From `@xndrjs/toolkit` repository root you can run Forma demo with:

```bash
pnpm --filter @xndrjs/forma-demo start:orders:sqlite
pnpm --filter @xndrjs/forma-demo start:orders:memory
pnpm --filter @xndrjs/forma-demo start:editorial
```

Orders demonstrates interchangeable storage Adapters, Params, lazy materialization, unary and
stream lifecycles, and real cleanup. Editorial demonstrates ownership extraction, a temporary Intent
alias, semantic Adapters, and multiple Entry Boundaries.

The benchmark app separately exercises larger dependency DAGs, concurrent execution, streams,
load, and soak behavior. Benchmarks establish operational evidence for the tested shapes; they do
not replace semantic tests.

## Current scope and non-goals

Forma currently supports closed executable Compositions. It does not yet define:

- merge semantics for partial Compositions;
- lazy selection among individual `using` dependencies after a Provider is requested;
- multicast, replay, push, reconnect, or transport framing for streams;
- mechanical enforcement of the TypeScript import graph between Boundary modules;
- additional lifetime scopes beyond Composition and Execution context.

The core is intentionally not:

- a general-purpose IoC container;
- a service locator;
- an application framework;
- an orchestration DSL;
- a required directory hierarchy;
- a domain-modeling replacement.

Boundary isolation at the Forma API is enforced through same-Boundary `using`, Adapter targets,
Entry Boundaries, and Composition validation. Preventing every illegal type-only or source import is
a repository-tooling concern outside the current core.

## Alpha expectations

The current package is alpha. Its implemented semantics—closed graphs, nominal protocol values,
owned lifetimes, total Boundary exits, and managed streams—are tested. The alpha label means API and
vocabulary may still receive intentional breaking changes before stabilization.

Use the package Glossary and ADRs when you need the rationale behind a decision. Use these guides as
the operational path for building an application.
