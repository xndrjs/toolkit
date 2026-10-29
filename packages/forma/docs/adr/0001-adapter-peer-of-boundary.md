# 0001. Adapter as a peer of Boundary

## Status

Accepted

## Context

Forma already had Boundary, Intent, Provider, Composition, Surface, and Binding. Same-boundary realization used `Intent.provide`; cross-boundary wiring used `bind`, which requires structurally equivalent contracts.

That left a gap when an external module must fulfill a target Boundary’s Intent while translating shapes or orchestrating Intents from other boundaries (for example Postgres row types → Orders domain types). Stretching Binding to cover translation would blur identity vs realization and invite ad-hoc “adapter” meaning that collides with ports-and-adapters slang. Treating every Provider as coming from a Boundary would also erase who created an external realization.

## Decision

Introduce **Adapter** as a first-class architectural identity, peer to Boundary:

- `adapter(id, targetBoundary)` is scoped to exactly one target Boundary.
- `.adapt(intent)` accepts only Intents of that target (compile-time `BoundaryId` check).
- `.using` may declare Intent dependencies from any boundary; `.with` / `.perContext` match the Provider builder.
- The result is a Provider registerable in `compose({ surface, wiring })`.
- Every Provider carries a required `origin` discriminant so Boundary ids and Adapter ids cannot collide as plain strings:

```ts
readonly origin:
  | { readonly kind: "boundary"; readonly id: string }
  | { readonly kind: "adapter"; readonly id: string };
```

- `Intent.provide…with` → `origin: { kind: "boundary", id: intent.boundaryId }`
- `adapter(id, …).adapt…with` → `origin: { kind: "adapter", id }`

`Intent.provide.using` remains same-boundary-only. Competing realizations of the same Intent identity throw at compose time. Binding stays the same-shape escape hatch; prefer Adapter when translation or multi-boundary orchestration is required.

**Superseded (registration only):** Binding is no longer registered under a separate `compose({ bindings })` key. Per [0002](./0002-unified-wiring-registration.md), aliases from `bind()` are entries in `wiring` alongside private Providers. The escape-hatch role of Binding (same-shape identity rewrite vs Adapter for translation) is unchanged.

Out of scope for this decision: redesigning `bind`, import-graph lint, a generic adapt helper, and global uniqueness of adapter ids.

## Consequences

- Cross-boundary, shape-changing wiring has an explicit home (`adapter(…).adapt(…)`) instead of overloading Binding or inventing informal “adapter providers.”
- Provider metadata can attribute realizations to Boundary vs Adapter without ambiguous `parentId` / `adapterId` / `contextId` names.
- Composition demos and docs steer toward Adapter for differing contracts; Binding remains for equivalent identities only.
- Glossary and package README document Adapter alongside Boundary; this ADR is the design record (replacing the exploratory `specs/initial-analysis.md` notes).
