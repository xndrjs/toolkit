# 02: Graph plan + cycle detection at compose — F2

**What to build:** At `compose`, build an execution plan; detect cycles (including concurrent A/B that deadlocked under `seeing`-only); keep runtime `seeing` as defense only. Diagnostic includes full path (`a -> b -> a`). Binding edges included in the plan.

**Blocked by:** 01

**Status:** done

- [x] Execution plan at compose (`using` + Binding edges)
- [x] Cycle detection with full path message
- [x] Closed-graph check at compose (runtime)
- [x] Runtime `seeing` kept as defense (path-aligned message)
- [x] Tests: single-chain cycle, concurrent surface A/B, Binding cycle/chain, happy path
- [x] GLOSSARY Composition note

**Verify:** `pnpm --filter @xndrjs/forma test` and `typecheck`

**Refs:** `packages/forma/docs/architectural-review.md` (F2), `packages/forma/src/graph-plan.ts`
