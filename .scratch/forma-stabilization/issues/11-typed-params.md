# 11: Typed execution params (replace seed)

**What to build:** Rename seed→params; declare ParamsReq on `.perContext`; type `WithContext.params` (not Lifetime); infer/merge at compose with conflict checks.

**Blocked by:** 07 (seed/signal baseline)

**Status:** done

- [x] `.perContext<ParamsReq>()`; `params` on WithContext + execution handle
- [x] Remove `Lifetime.seed`
- [x] compose infers ParamsReq merge; incompatible keys fail; `compose<Explicit>()` superset only
- [x] Hard rename (no `seed` shim)
- [x] Tests, ADR 0008 amend, GLOSSARY, README, demo without cast
- [x] Changeset

**Verify:** `pnpm --filter @xndrjs/forma test` + `typecheck`; `pnpm --filter @xndrjs/forma-demo start`

**Refs:** grilled design (params naming; ambient bag; Provider declaration; compose inference)
