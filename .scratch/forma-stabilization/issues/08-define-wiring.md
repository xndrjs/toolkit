# 08: `defineWiring` / composition helpers — F6

**What to build:** `defineWiring(...)` (const generics) so extracted wiring keeps provider precision; document that annotating as `ComposeOptions` widens and weakens checks; reject Provider unions at compose types (PoC default).

**Blocked by:** 01

**Status:** done

- [x] `defineWiring(...entries)` with const generics
- [x] `defineComposition({ surface, wiring? })` with same compile-time asserts
- [x] Provider unions rejected on surface aliases and wiring Provider slots
- [x] `ComposeOptions` JSDoc + README/GLOSSARY: bare annotation is a footgun
- [x] Tests: extracted `defineWiring` typechecks; plain array / union / widened `ComposeOptions` covered
- [x] ADR 0009 + changeset

**Verify:** `pnpm --filter @xndrjs/forma test` and `typecheck`

**Refs:** `packages/forma/docs/architectural-review.md` (F6), `packages/forma/docs/adr/0009-define-wiring-helpers.md`
