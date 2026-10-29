# 0005. Surface and `using` key hygiene

## Status

Accepted

## Context

Execution contexts expose surface aliases on the same object as `dispose()`. A surface alias named `dispose` overwrote lifecycle control at runtime and muddied the context type. Separately, mapped types accepted `symbol` keys on `surface` and `using`, but runtime used `Object.keys` / `Object.entries`, which drop symbols — so typed aliases never appeared on the context or in the factory deps map. Repeated `.using({ a }).using({ b })` silently replaced the whole deps map, dropping earlier keys. Object keys like `__proto__` could also pollute records built with ordinary prototypes.

## Decision

- **Reserved surface aliases:** `dispose` and `surface` are rejected at `compose` (type-level phantom assert + runtime). Operations nest under `execution.surface`; lifecycle stays on the handle.
- **String keys only:** surface and `using` dependency maps accept string keys only (type + `Reflect.ownKeys` runtime). `__proto__` is always rejected.
- **`using` is one-shot:** after the first `.using(...)`, the builder type omits `using`; a second call throws. Put every dependency in a single map.
- The borrowed surface object is created with a null prototype; dispose controls are not copied onto it.

Rejected: typed merge of successive `using` calls (more API surface for little gain while one-shot is clear). Rejected: supporting symbol keys end-to-end via `Reflect.ownKeys` (PoC stays on string aliases).

## Consequences

- Hosts cannot name a public surface operation `dispose` or `surface`; rename the alias.
- Call sites that chained `.using` must consolidate into one call.
- Call sites use `execution.surface.alias` / `withExecutionContext((surface) => …)` instead of flat `ctx.alias` (Design C / ADR 0006).
