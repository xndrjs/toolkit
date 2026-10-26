# 04: Implicit using graph

**What to build:** Surface Intent depends on another Intent in the **same** boundary via `using`. Satisfier is registered only under `providers` (same Intent identity). No `bindings` entry. Surface stays the only public API.

**Scenario:** `GetOrder.using({ find: FindOrder })` + `FindOrderProvider` in `providers` + `GetOrderProvider` in `surface` → `ctx.getOrder(id)` works; `ctx.findOrder` is not a property.

**Blocked by:** 03: Surface hello

**Status:** done

- [x] Composition resolves `FindOrder` by identity to `FindOrderProvider`
- [x] `getOrder` receives the resolved `find` operation and returns a `Result`
- [x] Type/runtime: private Intent not on the context object
- [x] Test covers success path through the chain

**Verify:** test fails if `providers` omits `FindOrderProvider` (runtime at minimum; compile-time may wait for 07).

**Refs:** `packages/forma/GLOSSARY.md`, `packages/forma/specs/initial-analysis.md`
