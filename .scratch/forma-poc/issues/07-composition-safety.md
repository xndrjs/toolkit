# 07: Composition safety

**What to build:** Fail loud when the graph for `surface` is wrong.

**Blocked by:** 04: Implicit using graph; 05: Explicit cross-boundary binding

**Status:** ready-for-agent

- [ ] **Type test:** `compose` with `surface` needing an Intent that has no provider after bindings is a compile error (PoC bar: missing provider)
- [ ] **Runtime:** same Intent in both `surface` and `providers` throws
- [ ] **Runtime:** ambiguous satisfaction (provider for Required **and** binding for Required) throws
- [ ] Tests document each case

**Verify:** type tests use `@ts-expect-error` (or project equivalent); runtime tests use `expect(() => …).toThrow`.

**Refs:** `packages/forma/GLOSSARY.md`, `packages/forma/specs/initial-analysis.md`
