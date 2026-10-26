# 07: Composition safety

**What to build:** Fail loud when the graph for `surface` is wrong.

**Blocked by:** 04: Implicit using graph; 05: Explicit cross-boundary binding

**Status:** done

- [x] **Type test:** `compose` with `surface` needing an Intent that has no provider after bindings is a compile error (PoC bar: missing provider)
- [x] **Runtime:** same Intent in both `surface` and `providers` throws
- [x] **Runtime:** ambiguous satisfaction (provider for Required **and** binding for Required) throws
- [x] Tests document each case

**Verify:** type tests use `@ts-expect-error` (or project equivalent); runtime tests use `expect(() => …).toThrow`.

**Notes:** Compile-time keys use `boundaryId.name`. Prefer curried `intent<In, S, E>()("name")` so literal names stay distinct (same as intent identity type tests).

**Refs:** `packages/forma/GLOSSARY.md`, `packages/forma/specs/initial-analysis.md`
