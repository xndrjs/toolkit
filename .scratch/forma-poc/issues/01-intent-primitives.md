# 01: Intent primitives

**What to build:** From application code you can create a Boundary and declare Intents with a Contract (`Input`, `Success`, expected `Error`). Success/failure use PoC `Result<T, E>`. Each Intent has a stable nominal identity and a boundary brand.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `boundary("orders")` and `Orders.intent<In, Success, Err>("find")` exist and export from `@xndrjs/forma`
- [ ] `Result` helpers (at least `ok` / `err` + type) exist for contracts
- [ ] Type test: two Intents with the same structural Contract are still distinct identities (not assignable as the same Intent)
- [ ] Type test: Intent from boundary `"orders"` is not the same brand as Intent from `"postgres"`
- [ ] Package still builds (`pnpm --filter @xndrjs/forma build`)

**Verify:** type tests under the forma package fail if brands/identities collapse; pass on the intended API.

**Refs:** `packages/forma/GLOSSARY.md`, `packages/forma/specs/initial-analysis.md`
