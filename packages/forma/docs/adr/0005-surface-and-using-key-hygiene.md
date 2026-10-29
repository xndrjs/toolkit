# 0005. Surface and `using` key hygiene

## Status

Accepted

## Context

Execution contexts expose surface aliases on the same object as `dispose()`. A surface alias named `dispose` overwrote lifecycle control at runtime and muddied the context type. Separately, mapped types accepted `symbol` keys on `surface` and `using`, but runtime used `Object.keys` / `Object.entries`, which drop symbols — so typed aliases never appeared on the context or in the factory deps map. Repeated `.using({ a }).using({ b })` silently replaced the whole deps map, dropping earlier keys. Object keys like `__proto__` could also pollute records built with ordinary prototypes.

## Decision

- **Reserved surface aliases:** `dispose` is rejected at `compose` (type-level phantom assert + runtime). Design C may later reserve `surface` when aliases move under `execution.surface`; not reserved yet.
- **String keys only:** surface and `using` dependency maps accept string keys only (type + `Reflect.ownKeys` runtime). `__proto__` is always rejected.
- **`using` is one-shot:** after the first `.using(...)`, the builder type omits `using`; a second call throws. Put every dependency in a single map.
- Execution context objects are created with a null prototype; `dispose` is assigned before surface aliases.

Rejected: typed merge of successive `using` calls (more API surface for little gain while one-shot is clear). Rejected: supporting symbol keys end-to-end via `Reflect.ownKeys` (PoC stays on string aliases).

## Consequences

- Hosts cannot name a public surface operation `dispose`; rename the alias.
- Call sites that chained `.using` must consolidate into one call.
- Follow-on Design C nesting should extend the reserved-alias list when `surface` becomes a context field.
