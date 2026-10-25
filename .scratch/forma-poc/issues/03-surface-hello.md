# 03: Surface hello

**What to build:** First closed Composition: one surface alias, no private providers, no bindings. Open an execution context, call the alias, dispose the context.

**Scenario:** Health/Ping — `compose({ surface: { ping: PingProvider } })` → `createExecutionContext()` → `await ctx.ping()` → `await ctx.dispose()`.

**Blocked by:** 02: Provider builder

**Status:** ready-for-agent

- [ ] `compose({ surface })` returns a root with `createExecutionContext()`
- [ ] Context exposes only surface keys (e.g. `ctx.ping` exists; nothing else from unregistered Intents)
- [ ] Calling the alias runs the provider factory (lazy) and returns the Contract outcome
- [ ] `ctx.dispose()` completes without error (even if no resources yet)
- [ ] Integration/unit test covers the scenario end-to-end

**Verify:** `pnpm --filter @xndrjs/forma test` includes a passing “ping” composition test.

**Refs:** `packages/forma/GLOSSARY.md`, `packages/forma/specs/initial-analysis.md`
