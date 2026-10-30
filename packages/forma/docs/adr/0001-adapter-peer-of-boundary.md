# 0001. Adapter as a peer of Boundary

## Status

Accepted

## Context

Forma already had Boundary, Intent, Provider, Composition, Surface, and an identity-rewrite escape hatch (then called Binding / `bind`). Same-boundary realization used `Intent.provide`; cross-boundary same-shape wiring used that rewrite, which requires structurally equivalent contracts.

That left a gap when an external module must fulfill a target Boundary’s Intent while translating shapes or orchestrating Intents from other boundaries (for example Postgres row types → Orders domain types). Stretching the identity rewrite to cover translation would blur identity vs realization and invite ad-hoc “adapter” meaning that collides with ports-and-adapters slang. Treating every Provider as coming from a Boundary would also erase who created an external realization.

## Decision

Introduce **Adapter** as a first-class architectural identity, peer to Boundary:

- `adapter(id, targetBoundary)` is scoped to exactly one target Boundary.
- `.adapt(intent)` accepts only Intents of that target (compile-time `BoundaryId` check).
- `.using` may declare Intent dependencies from any boundary; `.with` / `.perContext` match the Provider builder.
- The result is a Provider registerable in private `wiring`. Per
  [0013](./0013-entry-boundaries-and-surface-direction.md), Adapter-originated Providers cannot be
  Surface roots.
- Every Provider carries a required `origin` discriminant so Boundary ids and Adapter ids cannot collide as plain strings:

```ts
readonly origin:
  | { readonly kind: "boundary"; readonly id: string }
  | { readonly kind: "adapter"; readonly id: string };
```

- `Intent.provide…with` → `origin: { kind: "boundary", id: intent.boundaryId }`
- `adapter(id, …).adapt…with` → `origin: { kind: "adapter", id }`

`Intent.provide.using` remains same-boundary-only. Competing realizations of the same Intent identity throw at compose time.

**Superseded (registration only):** Intent aliases are no longer registered under a separate `compose({ bindings })` key. Per [0002](./0002-unified-wiring-registration.md), they are entries in `wiring` alongside private Providers.

**Superseded (same-shape default):** Prefer an Adapter (or same-boundary Provider) passthrough even when contracts match across boundaries. An Intent alias (`aliasIntent`) is a rare synonym escape hatch — see [0010](./0010-intent-alias.md). Prefer Adapter when translation or multi-boundary orchestration is required remains in force and is the default path for same-shape cross-boundary wiring too.

**Superseded (Surface eligibility):** the original decision allowed Adapter Providers in both
`surface` and `wiring`. ADR 0013 restricts them to private wiring so public traversal always starts
from a declared Entry Boundary.

Out of scope for this decision: import-graph lint, a generic adapt helper, and global uniqueness of adapter ids.

## Consequences

- Cross-boundary, shape-changing wiring has an explicit home (`adapter(…).adapt(…)`) instead of overloading Intent alias or inventing informal “adapter providers.”
- Provider metadata can attribute realizations to Boundary vs Adapter without ambiguous `parentId` / `adapterId` / `contextId` names.
- Composition demos and docs steer toward Adapter (including same-shape passthrough); Intent alias remains for deliberate synonyms only ([0010](./0010-intent-alias.md)).
- Glossary and package README document Adapter alongside Boundary; this ADR is the design record (replacing the exploratory `specs/initial-analysis.md` notes).
