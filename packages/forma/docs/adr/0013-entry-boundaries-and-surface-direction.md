# 0013. Entry Boundaries and Surface direction

## Status

Accepted

## Context

Forma distinguished Provider provenance at runtime, but `compose({ surface })` accepted both
Boundary- and Adapter-originated Providers as public roots. An Adapter can depend on Intents from
any Boundary, so making one a Surface root starts traversal from the least constrained node in the
graph. It also lets one Intent act simultaneously as public entry contract and unresolved dynamic
seam, bypassing an explicit realization owned by its Boundary.

A Composition is a runtime and lifecycle ownership unit, so forcing one Composition per Boundary
would introduce artificial roots, nested execution contexts, and duplicated composition-scoped
resources. What is missing is an explicit declaration of where public traversal starts.

## Decision

- Introduce **Entry Boundary**: a Boundary authorized to own Surface roots for one Composition.
- `compose` uses one inline options bag:

```ts
compose({
  entryBoundaries: [Orders, Billing],
  surface: { getOrder: GetOrderProvider, getInvoice: GetInvoiceProvider },
  wiring: [FindOrderViaPostgresProvider],
});
```

- `entryBoundaries` is required and non-empty. No legacy overload, inferred fallback, currying,
  fluent builder, or `defineEntryBoundaries` helper is provided.
- The declared Entry Boundary ids must equal the set of Boundary origins represented by Surface
  roots. Every declared Boundary owns at least one alias; every alias comes from a declared
  Boundary. Consequently, an empty Surface is invalid.
- Adapter-originated Providers are valid private wiring entries but never Surface roots. There is
  no escape hatch.
- Duplicate canonical Boundary ids are rejected at runtime and best-effort at type level for
  literal tuples.
- Provider types preserve their precise origin (`kind` and literal id) through the builder chain.
  Compile-time asserts and equivalent runtime validation enforce the same rule.
- A Composition may expose multiple Entry Boundaries and privately traverse any number of other
  Boundaries. Composition ownership does not become one-to-one with Boundary ownership.
- `describePlan()` exposes Entry Boundary ids, each Surface alias's Intent identity and root
  provenance, and each registered Provider's Boundary/Adapter origin with a nested `lifetime`
  explanation (`declared` / `effective` / optional `narrowedBy`).
- `defineWiring` and `defineComposition` remain extraction helpers. The normal and documented form
  keeps the whole composition inline.

## Consequences

- Public graph direction is inspectable and cannot be short-circuited through an Adapter.
- Public use-case Intents and unresolved dynamic-seam Intents become distinct when an Adapter
  supplies the seam. A same-shape Boundary Provider passthrough is valid and leaves room for later
  policy, mapping, filtering, or orchestration.
- Every existing `compose` call must declare its exact Entry Boundary set. This is an intentional
  alpha breaking change with no deprecated compatibility path.
- Type precision depends on retaining Provider provenance; bare `ComposeOptions` annotations remain
  discouraged because they erase concrete graph information.
