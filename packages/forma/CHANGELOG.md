# @xndrjs/forma

## 0.1.0-alpha.1

### Minor Changes

- d6d6c59: Add Adapter as a peer of Boundary (`adapter(id, target).adapt(intent)`) with Provider `origin` metadata and compose-time rejection of competing realizations.
- bcdaa2a: Rename the identity-rewrite primitive to Intent alias (`aliasIntent`, `IntentAlias`); Adapter passthrough is the default for cross-boundary same-shape wiring.
- 629bac1: Allow provider factories to return an Awaitable operation, with local Lifetime commit/rollback, no cache on failure, and coalesced inflight materialization.
- 00c7f51: Add `defineWiring` / `defineComposition` so extracted wiring keeps type precision, and reject Provider unions at compose types.
- c8a0866: Validate the composition dependency plan at `compose` (cycles with full path; closed graph); Binding edges included.
- 81ace3f: Give composition root and execution contexts terminal dispose state machines (`open | disposing | disposed`), shared dispose promises, and root-as-backstop shutdown of open contexts.
- c838018: Add typed execution-context seed and AbortSignal (shared open/with args; dispose aborts scope signal; per-context Lifetime.seed).
- ebe7757: Add cold streaming Intents with cancellation, ownership, transactional startup, deterministic
  cleanup, and `AsyncDisposable` surface streams. Require explicit Entry Boundaries, expose graph
  provenance through `describePlan()`, and harden runtime protocol branding so ordinary spread clones
  and raw Intent-alias tuples are rejected during composition.
- f244d23: Make Intent identity the structured pair `(boundaryId, intentName)` at runtime and in compose type-checks (remove fresh `Symbol` identity).
- b2be09b: Reserve surface alias `dispose`, require string keys for surface/`using` (reject `__proto__` and symbols), and make provider `.using()` one-shot so deps are not silently replaced.
- 81ab491: Replace execution `seed` with typed `params` on `.perContext<ParamsReq>()` / WithContext; compose infers and conflict-checks the host bag (no Lifetime.seed).
- d2e2aa9: Unify compose registration: `providers` and `bindings` become a single `wiring` array of Providers and `bind()` aliases.

### Patch Changes

- bb985d2: Ship GLOSSARY/docs in the published package; align README version and quickstart; demo teaches dual Adapters, seed policy, and Design C disposal.

## 0.1.0-alpha.0

### Minor Changes

- 4420287: Initial alpha release: intent-oriented composition (`forma`).
- Composition roots now declare an exact, non-empty `entryBoundaries` set. Adapter Providers are
  private wiring only; Surface roots must originate from the declared Boundaries.
- `describePlan()` now reports Entry Boundaries, Surface-root provenance, and each registered
  Provider's Boundary/Adapter origin. Lifetime fields are nested under `lifetime`
  (`declared` / `effective` / optional `narrowedBy`).
- Stream abort/close ownership now prevents pre-aborted starts and floating cleanup rejections,
  while attempting and aggregating every stream and Provider cleanup.
- Removed the deprecated `createExecutionContext` alpha alias; use `openExecutionContext`.

## 0.0.0

Proof-of-concept API for closed compositions.

- **P1 — `.contract`:** `boundary(id).intent(name).contract<Input, Success, Err>()` so Intent names stay string literals while contracts stay explicit.
- **P2 — Binding types:** `bind(required, satisfier)` accepts only structurally equivalent Intent contracts (Input / Success / Err); raw tuples are not accepted in `compose({ bindings })`.
- **P3 — Lifetime edges:** a composition-lifetime provider must not depend on a `.perContext()` provider — rejected at compile time and thrown at materialization.
- **P4+P5 — Unified `.with`:** factory receives a named context object and returns a `function` operation — prefer `ctx => function (…) { … }` over nested arrows; destructure only what you use. No flat operation overload and no separate `.setup`.
- **Minors:** robust `runDisposers` (all cleanups attempted), sealed context after `dispose()`, surface aliases typed as `Promise<Result<…>>`.

Initial package scaffold preceded these PoC notes.
