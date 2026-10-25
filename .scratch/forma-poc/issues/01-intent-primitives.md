# 01: Intent primitives

**What to build:** From application code you can create a Boundary and declare Intents with a Contract (`Input`, `Success`, expected `Error`). Success/failure use PoC `Result<T, E>`. Each Intent has a stable nominal identity and a boundary brand.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `boundary("orders")` and `Orders.intent<In, Success, Err>("find")` exist and export from `@xndrjs/forma`
- [x] `Result` helpers (at least `ok` / `err` + type) exist for contracts
- [x] Type test: two Intents with the same structural Contract are still distinct identities (not assignable as the same Intent)
- [x] Type test: Intent from boundary `"orders"` is not the same brand as Intent from `"postgres"`
- [x] Package still builds (`pnpm --filter @xndrjs/forma build`)

**Verify:** type tests under the forma package fail if brands/identities collapse; pass on the intended API.

**Note:** For type-level nominal identity (literal intent name), use the curried form `Orders.intent<In, Success, Err>()("find")`. The single-call form matches the plan API; TypeScript widens `Name` to `string` when contract type args are supplied in one call (no partial type inference).

**Refs:** `packages/forma/GLOSSARY.md`, `packages/forma/specs/initial-analysis.md`
