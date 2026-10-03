---
title: Ziel
description: Compile-time typed aggregate resolver — laws, stability, when not to use it, and an operational runbook.
---

`@xndrjs/ziel` is a **compile-time, typed aggregate resolver** for TypeScript applications: resource identity (ARI), multi-backend batching, projection, and cache islands. It sits on [`@xndrjs/resource-graph-resolver`](/v0/resource-orchestration/resource-graph-resolver/) and is **not** a general GraphQL replacement.

Package README and DSL reference: [`packages/ziel`](https://github.com/xndrjs/toolkit/tree/main/packages/ziel). Editor: [`ziel-vscode`](https://github.com/xndrjs/toolkit/tree/main/packages/ziel-vscode) (`xndrjs.ziel-vscode`). Vertical slices: CMS-shaped [`ziel-demo`](https://github.com/xndrjs/toolkit/tree/main/apps/ziel-demo) and commerce-shaped product detail in the same app (`ziel/queries/product-detail.ziel`).

## Positioning

| Use Ziel when…                                              | Prefer something else when…            |
| ----------------------------------------------------------- | -------------------------------------- |
| You own a **fixed** server read model (BFF / SSR aggregate) | Clients must invent arbitrary queries  |
| Several backends must **batch** and share a typed graph     | One REST call already is the aggregate |
| Cache boundaries (**islands**) matter                       | You only need a thin HTTP client       |
| You want **compile-time** projection types                  | Runtime schema stitching is enough     |

## Laws

These invariants are part of the alpha contract. Engines and codegen must obey them; apps should design ARIs and queries accordingly.

### 1. ARI identity

- An ARI names **one** resource instance (`type` + identity fields).
- String form (`resource.toString()` / `format()`) is the in-process and cache key unless you introduce a separate presentation encoding outside Ziel.
- Secrets (tokens, credentials) are **never** identity or cache dimensions. Semantic audience / tenant / market / locale belong in identity or execution context when they change the payload.

### 2. Local traversal only

- Loading a resource returns its **payload**, not an automatic walk of related ARIs.
- Edges exist only where the query declares `expand` / `each` / `resolve to` / `resolve to each`.
- A payload field typed `R[]` is an array of payloads, **not** an implicit fan-out to `R` ARIs.

### 3. Redirect

- Strategy `.resolve` policies run after decode and before expansion (first-match order).
- Chains compress to a canonical target; aliases share payload and failure attribution.
- Redirect cycles throw; they are structural, not softened by per-edge `on failure`.

### 4. Failure

- Roots always throw on load failure.
- Child edges use per-expand `on failure` (`throw` | `set null` | `set error`); strictest wins when the same ARI is discovered multiple times.
- Soft policies populate global `errors`; projection stays local (`null` or JSON-safe failure data).
- Datasource / redirect routing is **first-match**; declare one owner per ARI family.

### 5. Islands

- An island is a named subgraph boundary (`startIsland`), not a cache implementation.
- Membership (resources inside) and dependencies (edges to other islands) are distinct.
- Prefer lifecycle / reuse boundaries over fine-grained islands on every node.

### 6. Backing cache

- `backingResources` are opaque pre-resolved payloads consulted before sources.
- The map is never mutated; promoted keys are reported as `promotedResourceKeys`.
- Freshness, TTL, and invalidation stay in application infrastructure.

### 7. Serialization

- `SerializedIsland` schema **v1** is the portable island envelope.
- Schema v1 does not change during alpha unless an incompatibility is proven.
- Projected JavaScript object cycles are a separate concern from graph visitation (visitation already dedupes by ARI).

## Runtime budgets

Every resolve has finite defaults (nodes, edges, batches, duration). Override per execution via resolver / generated façade `budget`. Crossing a limit aborts with `ResourceGraphBudgetExceededError` and `onBudgetExceeded`. Details: [Resource graph resolver](/v0/resource-orchestration/resource-graph-resolver/).

## Stability matrix (alpha)

| Surface                                               | Stability    | Notes                                                                              |
| ----------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------- |
| DSL syntax (`.ziel`)                                  | **Unstable** | Breaking changes allowed in alpha; prefer changeset notes                          |
| Generated `resolve*` / `project*` / `create*Strategy` | **Unstable** | Regenerate after upgrades; treat output as build artifact                          |
| Generated TypeScript payload / result types           | **Unstable** | Shape follows DSL; `resourceTag` optional                                          |
| ARI string / `toString()`                             | **Cautious** | Avoid changing published identity encodings                                        |
| `SerializedIsland` schema v1                          | **Cautious** | Additive fields only if unavoidable                                                |
| `@xndrjs/ziel` runtime entry (re-exports)             | **Unstable** | Prefer package README for the current façade                                       |
| `@xndrjs/ziel/compile` public API                     | **Unstable** | Supported surface is `defineConfig`, `compileWorkspace`, and documented generators |
| `@xndrjs/ziel/lsp` / VS Code extension                | **Unstable** | Editor-only; bundle ships its own server                                           |
| `@xndrjs/resource-graph-resolver` core resolve API    | **Cautious** | Documented laws above; budget / observer hooks may grow                            |

“Cautious” means we avoid gratuitous breaks; alpha still may require migrations with a changeset.

## When not to use Ziel

- **Ad-hoc client queries** — if product needs GraphQL-style open query surface, keep GraphQL (or similar) and optionally implement _specific_ BFF aggregates with Ziel behind the scenes.
- **Single-backend CRUD** — a typed HTTP client + validators is simpler.
- **Mutations / writes** — Ziel is a read/aggregate resolver, not an ORM or mutation DSL.
- **Browser-only graphs without a BFF** — Langium/codegen and multi-source batching assume a Node build and usually a server resolve path.
- **Unbounded user-defined depth** — budgets exist, but product requirements that need arbitrary client-driven depth are a poor fit for predeclared queries.

## Operational runbook

### Limits

- Set `budget` for production topologies (lower than defaults for small pages; raise only with evidence).
- Forward `signal` into loaders so deadline abort cancels in-flight HTTP.
- Watch `onBudgetExceeded` / `ResourceGraphBudgetExceededError` in logs and APM.

### Observer

- Use `ResolutionObserver` for batch timing, misses, expansions, and budget events.
- Observer callbacks must not throw into the walk (failures are swallowed); keep them side-effect safe.

### Loaders

- Validate **untrusted** transport payloads inside `load` before returning; the engine trusts `load` results.
- Keep secrets and HTTP clients in closures / DI — not in Ziel `context`.
- One datasource owner per ARI family; `sources` order is first-match.

### Cache / islands

- Serialize with `serializeAllIslands` only after a successful resolve you intend to cache.
- Key caches by island id + your own schema / query fingerprint; do not put secrets in keys.
- On incident: compare `contentMap` vs `islands` vs `islandDependencies` — membership ≠ dependency.

### Incident diagnosis checklist

1. Is the failure a **wiring** miss (`NoDataSourceError`) or a **data** miss (`MissingResourceError` / soft `errors`)?
2. Which expand edge’s `on failure` policy applied?
3. Did a **redirect** cycle or chain change the canonical key?
4. Did a **budget** fire (`onBudgetExceeded`)?
5. Are duplicate datasources overlapping the same ARI family (first-match surprise)?
6. For cache bugs: was the island boundary wrong, or was stale backing promoted?

## Benchmarks

Scheduler and orchestration comparisons: [`resource-graph-resolver-bench`](https://github.com/xndrjs/toolkit/tree/main/apps/resource-graph-resolver-bench) (`lane` vs `barrier`, plus naive / batched orchestration modes).

## License

MIT — see the monorepo root.
