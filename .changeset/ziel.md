---
"@xndrjs/ziel": major
---

Require Node.js 24 or 25 (`>=24 <26`). Watch mode uses Chokidar with recursive, debounced, serialized regeneration and clean asynchronous shutdown.

### Language / DSL

- Add `and` / `or` / `(…)` to when-expressions; flatten islands to `on Resource [binding] [when expr]` (one startIsland per clause; combine conditions with `or`).
- Add `in` / `not in` (literal array membership) and unary `!` (JS falsy) to shared when-expressions — projections, resolve arms, expand arms, and islands.
- Add projection `include all` / `include properties` on clauses and `when` arms (payload field sets minus `refers` relationships; expand aliases shadow; arm include from narrowed payload with `arm ?? clause` inheritance). Allow bare `refers Entry` without a `with` pattern.
- Add `refers` object-field annotations (`refers Entry with { type: "Menu" }`) for intended expand targets. Checker validates patterns against resource payloads; armed projection codegen narrows expand alias types to matching `on R` variants.
- Support multi-root queries via `roots { alias: Construction }` alongside singular `root`. IR uses `roots: QueryRoot[]`; codegen emits alias-keyed `*Result` / `project*` / `resolve*` façades while preserving single-root ergonomics. Requires `@xndrjs/resource-graph-resolver` `roots[]` resolve input.
- Emit island policies from DSL `islands { on Resource … }` blocks into open `create*Strategy` builders (`islands.on(…)[.when(…)].startIsland()`), so `resolve*` / `.build()` pick them up without hand-wiring.

### Codegen

- Emit per-query `create{Query}DataSources` factories typed on each query's execution context instead of a single aggregate `createDataSources`.
- Codegen emits a `Scalars` namespace of typed brand factories (`Scalars.EntryId(value)`) alongside scalar type aliases. Empty scalar programs still emit nothing; uncapitalized top-level helpers are not generated.
- Generated Ziel projectors consume the resolver's canonical failure map directly (redirect graph invariants).
- Bound every graph resolution with configurable node, edge, batch, and duration budgets; generated façades support finite defaults, typed budget errors, observer telemetry, and deadline cancellation.
- Align with positional `DataSource.load`: return `(payload | undefined)[]` matching `batch` order (`undefined` = miss; `null` remains a legal payload). Identity hops use strategy `.resolve` only.
- Depend on `@xndrjs/addressable-resources` (renamed from `@xndrjs/application-resources`); generated modules and façades use `AddressableResource*` types and `resource.key` object access.

### LSP / editor

- Add Langium document formatting for `.ziel` (Format Document / range) via `ZielFormatter` in the language server.
- Pretty-print resource/field/fragment hover signatures (multiline identity and payload).
- LSP hover, completion, and go-to-definition understand island bindings and `when` paths.

### Docs / adoption

- Document first-match datasource and redirect routing (one owner per ARI family). Clarify that loaders must validate untrusted payloads at the boundary.
- Document Ziel laws, stability matrix, when-not-to-use guidance, and an operational runbook. Add a commerce product-detail demo and resolver-bench orchestration modes (naive / batched) for adoption trust.
