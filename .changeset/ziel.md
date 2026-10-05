---
"@xndrjs/ziel": minor
"ziel-vscode": minor
---

Require Node.js 24 or 25 (`>=24 <26`). Watch mode uses Chokidar with recursive, debounced, serialized regeneration and clean asynchronous shutdown.

### Language / DSL

- Add `opaque Name;` for nominal, non-inspectable payload leaves (no representation clause). Opaque types may appear in payloads (roots, fields, arrays, unions, type projections) but not in identity, query params, datasource `context`, or `refers`. Checker rejects inspectable uses in `when` expressions and name clashes with scalars/resources.
- Reject non-primitive identity fields (`INVALID_IDENTITY_TYPE`): identity must be `string` | `number` | `integer` | `boolean` or a scalar of those — not nested objects, arrays, nullables, unions, or resource refs.
- Unknown bare type names diagnose as `UNKNOWN_TYPE` (scalar / opaque / resource namespaces).
- Add `and` / `or` / `(…)` to when-expressions; flatten islands to `on Resource [binding] [when expr]` (one startIsland per clause; combine conditions with `or`).
- Add `in` / `not in` (literal array membership) and unary `!` (JS falsy) to shared when-expressions — projections, resolve arms, expand arms, and islands.
- Add projection `include all` / `include properties` on clauses and `when` arms (payload field sets minus `refers` relationships; expand aliases shadow; arm include from narrowed payload with `arm ?? clause` inheritance). Allow bare `refers Entry` without a `with` pattern.
- Add `refers` object-field annotations (`refers Entry with { type: "Menu" }`) for intended expand targets. Checker validates patterns against resource payloads; armed projection codegen narrows expand alias types to matching `on R` variants.
- Support multi-root queries via `roots { alias: Construction }` alongside singular `root`. IR uses `roots: QueryRoot[]`; codegen emits alias-keyed `*Result` / `project*` / `resolve*` façades while preserving single-root ergonomics. Requires `@xndrjs/resource-graph-resolver` `roots[]` resolve input.
- Emit island policies from DSL `islands { on Resource … }` blocks into open `create*Strategy` builders (`islands.on(…)[.when(…)].startIsland()`), so `resolve*` / `.build()` pick them up without hand-wiring.

### Runtime

- `OpaqueType.unwrap` accepts an optional type argument (`unwrap<T = unknown>`) so trusted callers can assert the loader-validated shape without a separate cast; omit `T` to keep `unknown` for re-parse.

### Codegen

- Emit opaque runtime tokens via `defineOpaqueType` / `OpaqueValueOf` (conditional imports; opaque-only modules omit `ari` / `s`). Programs without opaques keep prior output.
- Emit per-query `create{Query}DataSources` factories typed on each query's execution context instead of a single aggregate `createDataSources`.
- Codegen emits a `Scalars` namespace of typed brand factories (`Scalars.EntryId(value)`) alongside scalar type aliases. Empty scalar programs still emit nothing; uncapitalized top-level helpers are not generated.
- Multi-file product emit: `out` is a **directory** (`resources.ts` + `{QueryName}.query.ts` per query using the IR name as-is; no barrel). CLI rejects `.ts`/`.js` `out` paths, ignores the whole `out` dir in watch mode, and deletes only stale managed files that still carry the generated header.
- Generated Ziel projectors consume the resolver's canonical failure map directly (redirect graph invariants).
- Bound every graph resolution with configurable node, edge, batch, and duration budgets; generated façades support finite defaults, typed budget errors, observer telemetry, and deadline cancellation.
- Align with positional `DataSource.load`: return `(payload | undefined)[]` matching `batch` order (`undefined` = miss; `null` remains a legal payload). Identity hops use strategy `.resolve` only.
- Depend on `@xndrjs/addressable-resources` (renamed from `@xndrjs/application-resources`); generated modules and façades use `AddressableResource*` types and `resource.key` object access.
- Distinguish DSL `number` (finite float) from `integer` (finite int): identity emit maps to `s.number()` / `s.integer()`; both erase to TypeScript `number` in scalar brands and payload types. `integer` is assignable to `number`; the reverse is not.

### LSP / editor

- Recognize `opaque` declarations: payload-only completion, hover signatures, cross-file go-to-definition, formatter, and TextMate keyword highlighting (`ziel-vscode`). Name resolution order matches lowering (resource → scalar → opaque).
- Add Langium document formatting for `.ziel` (Format Document / range) via `ZielFormatter` in the language server.
- Pretty-print resource/field/fragment hover signatures (multiline identity and payload).
- LSP hover, completion, and go-to-definition understand island bindings and `when` paths.

### Docs / adoption

- Document opaque payload leaves (DSL, adapter `.wrap`, composition-root `createOpaqueRegistry`) and clarify that resource payloads are not always object/union shapes.
- Document first-match datasource and redirect routing (one owner per ARI family). Clarify that loaders must validate untrusted payloads at the boundary.
- Document Ziel laws, when-not-to-use guidance, and an operational runbook. Add a commerce product-detail demo and resolver-bench orchestration modes (naive / batched) for adoption trust.
- Document multi-file codegen layout, IR-cased query filenames, stale managed-file cleanup, and directory `out` semantics; migrate `ziel-demo` to `./src/generated` with direct module imports (no barrel).
