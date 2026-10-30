# @xndrjs/forma

## 0.1.0-alpha.0

### Minor Changes

- 4420287: Initial alpha release: intent-oriented composition (`forma`).
- Composition roots now declare an exact, non-empty `entryBoundaries` set. Adapter Providers are
  private wiring only; Surface roots must originate from the declared Boundaries.
- `describePlan()` now reports Entry Boundaries, Surface-root provenance, and each registered
  Provider's Boundary/Adapter origin.
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
