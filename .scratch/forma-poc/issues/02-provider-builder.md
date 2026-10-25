# 02: Provider builder

**What to build:** On an Intent, build a Provider with `provide` → optional `using` → optional `perContext` → `with(factory)`. `using` only accepts Intents of the **same** boundary brand. No `compose` yet — providers are values you can inspect/test in isolation.

**Blocked by:** 01: Intent primitives

**Status:** done

- [x] `Ping.provide.with(() => () => …)` builds a provider for a no-deps Intent
- [x] `Cancel.provide.using({ find: FindOrder }).with(…)` types `find` from FindOrder’s Contract without re-declaring it
- [x] Type test: `using({ x: OtherBoundaryIntent })` is a compile error
- [x] `.perContext()` can appear in the chain before `with` (scoping behaviour deferred to 06; here only API + type retention)
- [x] Unit/type tests pass; package builds

**Verify:** a small test file constructs providers; `tsc`/type tests catch cross-boundary `using`.

**Refs:** `packages/forma/GLOSSARY.md`, `packages/forma/specs/initial-analysis.md`
