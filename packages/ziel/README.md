# @xndrjs/ziel

**Product entry** for Ziel with these surfaces:

| Export                 | Use for                                                                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@xndrjs/ziel`         | Runtime façade: resource graph resolver + application-resource (ARI) primitives + `ContentMap` — browser-safe                                                                                                                     |
| `@xndrjs/ziel/compile` | Compile-time DSL: IR, `checkProgram`, Langium parse/lower, `parseAndCheck`, `generateResources`, `generateStrategies`, `generateProjections`, `generateDataSources`, `defineConfig`, `buildResources` — Node / CI / build only    |
| `@xndrjs/ziel/lsp`     | Language server helpers + `ziel-language-server` bin (stdio) — workspace collect/merge → diagnostics + IntelliSense (hover / completion / definition)                                                                             |
| `ziel-codegen` (bin)   | CLI: load `ziel.config.ts`, collect `.ziel` files, emit TypeScript (resources + strategies + datasources + `project*` + `resolve*` façades) — writes `out`, `--dry-run` to stdout, or `--watch` / `--dev` to regenerate on change |

Prefer this package for app code. Depend on [`@xndrjs/resource-graph-resolver`](../resource-graph-resolver) directly only when you need the engine without the DSL.

**Vertical-slice example:** [`apps/ziel-demo`](../../apps/ziel-demo) — `.ziel` → codegen → `resolvePageDetail` (closed strategy → multi-DataSource `resolve` → `projectPageDetail`; low-level `create*Strategy` / `project*` still exported).

**Editor:** [`.ziel` syntax highlighting + LSP diagnostics + IntelliSense + Format Document](../ziel-vscode) (VS Code / Cursor extension `xndrjs.ziel-vscode`). Live squiggles, hover, completion, go-to-definition, and formatting share the language server in `@xndrjs/ziel` (semantic features use the same multi-file snapshot as codegen: multi-file when a nearby `ziel.config.*` scopes the collect; otherwise single-file only). Build `@xndrjs/ziel` first so `ziel-language-server` exists under `dist/lsp/` (required for F5 / Install from Location).

Full engine guide: [Resource graph resolver](https://www.xndrjs.dev/v0/infrastructure/resource-graph-resolver/) on the xndrjs docs site.

## Installation

```bash
pnpm add @xndrjs/ziel
```

## Codegen CLI

Keep options in `ziel.config.ts` and run the local bin:

```ts
import { defineConfig } from "@xndrjs/ziel/compile";

export default defineConfig({
  // root defaults to process.cwd()
  // include defaults to ["**/*.ziel"]
  // exclude defaults to ["**/node_modules/**"]
  // pathFilter?: string | RegExp  — optional filter on posix path relative to root
  // requireDatasourceCoverage defaults to true — every resource needs a `for` route when datasources exist
  out: "./src/generated/resources.ts",
  // importFrom / registryTypeName optional → generateResources
});
```

```json
{
  "scripts": {
    "ziel:codegen": "ziel-codegen --config ./ziel.config.ts",
    "ziel:dev": "ziel-codegen --config ./ziel.config.ts --watch"
  }
}
```

```bash
pnpm ziel-codegen --config ./ziel.config.ts
pnpm ziel-codegen --config ./ziel.config.ts --dry-run
pnpm ziel-codegen --config ./ziel.config.ts --watch   # or --dev
```

Flags: `--config`, `--out`, `--root`, `--dry-run`, `--watch` / `--dev`, `--help`. CLI wins over config (with a warning). `include` / `exclude` / `pathFilter` / `requireDatasourceCoverage` are config-only. Diagnostics → exit `1` and no write (in `--watch` / `--dev`, errors are logged and the watcher keeps running).

`--watch` / `--dev` regenerate when any `.ziel` under `root` (or the config) changes. The output file is ignored so writes do not loop. Unchanged content is not rewritten (stable mtimes).

One config = one `out`. Multiple targets = multiple config files or scripts.

Generated modules import runtime symbols (`ari`, `s`, `createGraphResolutionStrategy`, `createResourceGraphResolver`, `ContentMap`, …) from `@xndrjs/ziel` (override with `importFrom` if needed). App code should use that same runtime entry — never `/compile`.

## Usage

Client / runtime — import from the main entry only:

```ts
import {
  createResourceGraphResolver,
  createGraphResolutionStrategy,
  ari,
  s,
  type ContentMap,
} from "@xndrjs/ziel";
```

Build / codegen / typecheck tooling — use the compile subpath:

```ts
import {
  defineConfig,
  parseAndCheck,
  checkProgram,
  generateResources,
  generateStrategies,
  generateProjections,
  generateDataSources,
  buildResources,
  type Program,
} from "@xndrjs/ziel/compile";

const { program, diagnostics } = parseAndCheck(source);
if (diagnostics.length === 0) {
  const { code: resources } = generateResources(program);
  const { code: strategies } = generateStrategies(program);
  const { code: projections } = generateProjections(program);
  const { code: datasources } = generateDataSources(program);
  // Pure TypeScript source strings — CLI / buildResources compose + write.
}

// Multi-file pipeline (no FS write — CLI persists when diagnostics are empty):
const result = buildResources({ root: process.cwd() });
```

`generateResources` emits branded scalar types, a `Scalars` factory namespace, ARI factories (`postAri`), payload types (`PostPayload`), and a `ContentRegistry` slice from a checked `Program`. Queries are ignored.

**Scalar factories** — each scalar gets a PascalCase key on `Scalars` whose param is the representation (`string` | `number` | `boolean`) and return type is the branded alias. Prefer factories over casts in adapters and fixtures:

```ts
import { Scalars, type EntryId, type Locale } from "./generated/resources";

const id: EntryId = Scalars.EntryId(parsed.id);
const locale: Locale = Scalars.Locale("en-US");
```

There are no uncapitalized top-level helpers (`entryId(…)`). An empty scalars program emits nothing for this section.

`generateStrategies` emits one open `create*Strategy` fluent builder per query (params/context types + `.expansion.on(…).expand(…)`, plus `islands.on(…)[.when(…)].startIsland()` when the query declares an `islands` block). Armed `on` projections emit one `.on(ari).when(…).expand(…)` per expanding arm; flat `on` stays `.on(ari).expand(…)`. Many-expands use `each` (multi-arm `when` → order-preserving `flatMap`); collection expand targets fan out member ARIs. Per-edge `on failure` policies land on `ExpansionResult.onFailure` (or `onFailureByKey` when edges disagree). The factory returns the builder **without** `.build()`, so apps can still attach extra island policies by hand before calling `.build()`.

`generateProjections` emits memoized `project*` materializers and query-scoped result types (`PostDetailResult`, `PostDetail_Post`, …). Projection shapes follow the DSL only — there is no default resource-name stamp. Pass `resourceTag` (e.g. `"$type"` or `"__resource"`) on codegen options / `ziel.config.ts` to opt into stamping the resource name on shells and types. Apps pass a resolved `ContentMap` and seed ARI(s); aliases are restored. Generated code imports `ContentMap` from `@xndrjs/ziel` only — no extra runtime helper.

`buildResources` / `ziel-codegen` also emit a closed `resolve*` façade per query (`resolvePostDetail`, …): takes `createResourceGraphResolver` config minus `strategy` (including optional runtime `budget` overrides), plus `resolve` input and query params; runs strategy → resolve → project; returns `{ postDetail, contentMap, islands, islandDependencies, errors, promotedResourceKeys }`. There is **no** global `missingResourceMode` on resolve input — roots always throw; child load failures follow each expand’s `on failure` policy. `create*Strategy` and `project*` remain exported for low-level use.

`buildResources` / `ziel-codegen` compose resources + strategies + projections + resolve façades into one module when queries exist. When the program declares one or more `datasource` blocks, the same compose path also emits `createDataSources`. Generated imports stay on `@xndrjs/ziel` only.

### Datasource declarations

Declare routing metadata with bare `datasource` (same style as `resource` / `query`). The DSL owns which resources a source handles and optional route predicates; the app still owns IO (`load`, `batchSize`, `concurrency`).

```ziel
datasource CmsSource {
  context { locale: Locale }
  for Entry e when context.locale == @e.locale
  for Asset
}
```

- **`context`** — fields available as `executionContext` on that source (and merged into aggregate `ZielExecutionContext`).
- **`for Resource [binding] [when …]`** — routes; `when` may use `context.…` and identity `@binding.…` only (no payload / params / items). Binding is required when `when` is present.
- **Coverage** — if the program declares ≥1 datasource, every resource must appear in at least one `for` route (hand-wired apps with zero datasources stay valid). Disable with `requireDatasourceCoverage: false` in `ziel.config.ts` (default `true`; honored by CLI and LSP).
- **Query context** — when datasources exist, each query context must include every field from the datasources whose routes intersect resources that query references (roots, islands, `on` clauses, expand / resolve targets), with compatible types. Unused datasources do not constrain that query. Aggregate `ZielExecutionContext` (for `createDataSources`) remains the merge of all datasource contexts.

Codegen (`generateDataSources` / compose) emits per-source `*Context` types, aggregate `ZielExecutionContext`, and:

```ts
createDataSources({
  CmsSource: {
    load: (batch, context) => {
      /* app IO */
    },
    batchSize: 20,
    concurrency: 4,
    // when?: …  — only when no route on this DS has a DSL `when`
  },
});
```

`load` keeps `(batch, context: ResourceLoadContext<DsContext>)` and returns the payload union (`EntryPayload | AssetPayload | undefined`)[]. DSL `when` compiles to a single runtime predicate over `defineDataSourceFor` lanes; if every route omits DSL `when`, an optional implementation `when` may be supplied on the config instead.

### `on failure` (per-expand load policy)

After a one-expand target or an `each` arm, declare what happens when that child fails to load. Omitted → **`throw`** (same as the resolver default). There is no global soft-fail mode on `resolve*` input.

```ziel
expand menu: Entry(id: p.menuId, locale: @p.locale) on failure set null
expand soft: Entry(id: p.softId, locale: @p.locale) on failure set error
expand items: each link in p.items (
  Entry(id: link.id, locale: @p.locale) on failure set null
)
```

| Policy      | Resolver                                                     | Projected alias type     |
| ----------- | ------------------------------------------------------------ | ------------------------ |
| `throw`     | throw (`MissingResourceError` / load errors)                 | `Foo`                    |
| `set null`  | record `ResolutionError` in `errors`, omit payload, continue | `Foo \| null`            |
| `set error` | record `ResolutionError` in `errors`, continue               | `Foo \| ResolutionError` |

Both soft policies populate global `errors` (detect any failure without walking the tree). Projection stays local: `null` vs the `ResolutionError` instance. Many-expand array elements follow each arm’s policy (`(Foo | null)[]`, …). Same ARI discovered by several edges → strictest wins (`throw` > `setError` > `setNull`). Datasources may `throw new ResolutionError(code, message, cause)`; under `set error` consumers use `instanceof ResolutionError`.

### `refers` field annotations

Object fields may declare intended expand targets with `refers` (types + check only — no runtime assert):

```ziel
menuId: EntryId refers Entry with { type: "Menu" }
chromeId: EntryId refers Entry with { type: "Menu" | "Footer" }
eitherId: EntryId refers Entry with { type: "Menu" } | Entry with { type: "Footer" }
strips: { id: EntryId }[] refers Entry
```

Bare `refers Entry` matches any payload member. `with { … }` is a partial payload pattern: **AND** across fields; each field value is a string literal or `|`-union of literals (**OR** on that field). When an expand constructs a resource from a field that carries `refers`, and the query has armed `on R` variants, codegen narrows the expand alias (e.g. `PageDetail_Entry_Menu` instead of `PageDetail_Entry`). Flat (non-armed) `on R` projections are not structurally narrowed.

### `include` modes

The same three modes apply on projection clauses (`on`) and projection `when` arms — **not** on fragments. Includes are always computed against the **(narrowed) raw resource payload**, never against another projection’s selected fields:

| Mode                 | Meaning                                                                            |
| -------------------- | ---------------------------------------------------------------------------------- |
| `include none`       | Start from empty; only explicit selections / expands remain                        |
| `include all`        | All selectable payload fields (object: all fields; union: intersection of members) |
| `include properties` | That set minus fields whose `refers` is set (relationships)                        |
| omitted              | No auto-include; explicit only. Does **not** override a parent clause              |

Body-level `exclude name` subtracts a field from the effective set (repeat the clause for more names):

```ziel
on Entry e include all {
  exclude imageId
  exclude title
}
```

Effective selection is `(includeSet ∪ explicit) − excluded − expandAliases`. Errors if a name is also selected explicitly, equals an expand alias, is unknown on the (narrowed) payload, or is duplicated across `exclude` lines.

```ziel
on Page p include properties {
  expand menu: Entry(…)
  expand strips: each link in p.strips ( Entry(…) )
}
on Entry e include properties {
  when e.type == "Hero" include none { title }
  when e.type == "Page" include properties { }
  default { }
}
on Asset a include all { }

fragment MenuChrome on Entry e when e.type == "Menu" {
  expand logo: Asset(…)
}
```

- On a `when` arm, the include set uses the **narrowed** payload. Effective mode is `arm.include ?? clause.include` — so an inner `include none` **overrides** an outer `include properties` / `include all`.
- Expand aliases with the same name as a payload field **shadow** the native field (silent drop; expand wins). Explicit duplicate field names stay errors. `exclude` of an expand alias is an error.
- Allowed on normal `on R b { … }` and its `when` / `default` arms (not fragments, not `resolve to`). Fragments contribute explicit fields / expands / excludes only; the enclosing clause owns `include`.
- `when` arms are applied **in source order** (first match wins). They are **not** checked for discriminant exhaustiveness. If the clause has one or more `when` arms, a trailing `default { … }` is **required**.
- `expand … using Fragment` is **not** in this release (deferred).

### Fragments

Reusable projection bodies: `fragment Name on Resource binding [when …] { … }`. Spreads (`...Name`) desugar into the enclosing body; the fragment’s `when` narrows its body for checks. Field auto-include is declared on the enclosing `on` / `when` arm, not on the fragment.

```ziel
fragment MenuOnly on Entry e when e.type == "Menu" {
  logoId
  expand logo: Asset(id: e.logoId, locale: context.locale)
}

on Entry e {
  when e.type == "Hero" { type id title }
  when e.type == "Menu" { type id ...MenuOnly }
  default { }
}
```

- Fragment `when` narrows the binding’s payload for field checks and expands (same `narrowPayloadByFilter` as projection arms). Menu-only fields like `logoId` are valid under `when e.type == "Menu"` and rejected without a matching `when`.
- Spreading a fragment into an arm whose narrowing is disjoint from the fragment’s `when` reports `FRAGMENT_WHEN_MISMATCH`.
- **IntelliSense:** inside a fragment body with `when`, completion and hover use the narrowed payload type (same as projection `when` arms). Without `when`, the full resource payload applies.

### When expressions

Every `when` (projection arms, fragment declarations, `resolve to`, expand arms, islands) shares one expression language:

```ziel
when e.type == "Menu"
when e.type != "Hero"
when e.type in ["Menu", "Footer"]
when e.type not in ["Hero"]
when !e.visible
when e.type == "Menu" or e.type == "Footer"
when e.visible and e.type in ["Hero", "Tabs"]
when !(e.hidden or e.type == "Draft")
```

| Op           | Meaning                                                     | Emitted JS                              |
| ------------ | ----------------------------------------------------------- | --------------------------------------- |
| `==` / `!=`  | equality (operands must be compatible; use `as`)            | `left == right`                         |
| `in […]`     | membership (literal list)                                   | `[…].includes(left)`                    |
| `not in […]` | negated membership                                          | `![…].includes(left)`                   |
| `as`         | erase scalar / matching type to `string`/`number`/`boolean` | operand (runtime erase)                 |
| `!`          | JS falsy (`null` / `undefined` / `false` / `0` / `""`)      | `!(operand)`                            |
| `and` / `or` | boolean connectives                                         | `(left && right)` / `(left \|\| right)` |
| `(…)`        | grouping                                                    | lowered away                            |

Precedence: `as` > `!` > `==`/`!=` > `in`/`not in` > `and` > `or`. So `!e.x in […]` is `(!e.x) in […]`. Array literals on the right of `in` / `not in` hold literals only. Filters may narrow payloads for field checks (best-effort); they do **not** drive static arm exhaustiveness — use ordered `when` + required `default` on armed projections.

Scalars are nominal: `Locale` and `CustomReferenceValue` are not comparable even when both wrap `string`. Erase explicitly:

```ziel
when context.locale as string == @c.ref as string
when e.kind == "Hero"   # stringLiteral still inhabits a string/scalar discriminant field
```

Islands are flat clauses (one policy each):

```ziel
islands {
  on Entry e when e.type == "Menu" or e.type == "Footer"
  on Page
}
```

### Single-root vs multi-root queries

A query seeds the graph with either one `root` or several aliased entries in `roots { … }` (XOR — not both). Multi-root aliases must be unique. The engine enqueues every seed into one resolution session (shared ContentMap, waiters, and lane scheduler) and runs until closure.

```ziel
# single-root — Result is the root resource projection
query PageDetail(pageId: EntryId) {
  root Page(id: pageId, …)
  on Page p { … }
}

# multi-root — Result is alias-keyed
query Homepage(pageId: PageId, sessionId: SessionId) {
  roots {
    page: Page(id: pageId)
    session: UserSession(id: sessionId)
  }
  on Page p { … }
  on UserSession s { … }
}
```

Codegen preserves single-root ergonomics and keys multi-root APIs by alias:

| Surface          | Single-root                               | Multi-root                                                 |
| ---------------- | ----------------------------------------- | ---------------------------------------------------------- |
| `*Result`        | `PageDetailResult = PageDetail_Page`      | `{ page: Homepage_Page; session: Homepage_UserSession }`   |
| `project*`       | `projectPageDetail(root, contentMap, …)`  | `projectHomepage(roots: { page; session }, contentMap, …)` |
| `resolve*` input | `params` + `executionContext` (no `root`) | same — façade builds each root ARI from the query DSL      |
| Engine call      | `resolve({ roots: [root], … })`           | `resolve({ roots: [roots.page, …], … })`                   |

Generated app code should import runtime symbols from `@xndrjs/ziel`, never from `/compile`. Langium, the checker, and codegen live under `./compile` only so they do not land in client bundles.

## License

MIT
