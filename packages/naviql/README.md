# @xndrjs/naviql

**Product entry** for NaviQL with these surfaces:

| Export                   | Use for                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@xndrjs/naviql`         | Runtime façade: resource graph resolver + application-resource (ARI) primitives + `ContentMap` — browser-safe                                                                                           |
| `@xndrjs/naviql/compile` | Compile-time DSL: IR, `checkProgram`, Langium parse/lower, `parseAndCheck`, `generateResources`, `generateStrategies`, `generateProjections`, `defineConfig`, `buildResources` — Node / CI / build only |
| `@xndrjs/naviql/lsp`     | Language server helpers + `naviql-language-server` bin (stdio) — workspace collect/merge → `checkProgram` diagnostics                                                                                   |
| `naviql-codegen` (bin)   | CLI: load `naviql.config.ts`, collect `.naviql` files, emit TypeScript (resources + strategies + `project*` + `resolve*` façades) — writes `out` or `--dry-run` to stdout                               |

Prefer this package for app code. Depend on [`@xndrjs/resource-graph-resolver`](../resource-graph-resolver) directly only when you need the engine without the DSL.

**Vertical-slice example:** [`apps/naviql-demo`](../../apps/naviql-demo) — `.naviql` → codegen → `resolvePageDetail` (closed strategy → multi-DataSource `resolve` → `projectPageDetail`; low-level `create*Strategy` / `project*` still exported).

**Editor:** [`.naviql` syntax highlighting + LSP diagnostics](../naviql-vscode) (VS Code / Cursor extension `xndrjs.naviql-vscode`). Live squiggles use the same `parseAndCheck` / `checkProgram` rules as codegen: multi-file when a nearby `naviql.config.*` scopes the collect; otherwise single-file only (no monorepo-root glob). Build `@xndrjs/naviql` first so `naviql-language-server` exists under `dist/lsp/` (required for F5 / Install from Location). Completion, hover, and rename are not in this MVP.

Full engine guide: [Resource graph resolver](https://www.xndrjs.dev/v0/infrastructure/resource-graph-resolver/) on the xndrjs docs site.

## Installation

```bash
pnpm add @xndrjs/naviql
```

## Codegen CLI

Keep options in `naviql.config.ts` and run the local bin:

```ts
import { defineConfig } from "@xndrjs/naviql/compile";

export default defineConfig({
  // root defaults to process.cwd()
  // include defaults to ["**/*.naviql"]
  // exclude defaults to ["**/node_modules/**"]
  // pathFilter?: string | RegExp  — optional filter on posix path relative to root
  out: "./src/generated/resources.ts",
  // importFrom / registryTypeName optional → generateResources
});
```

```json
{
  "scripts": {
    "naviql:codegen": "naviql-codegen --config ./naviql.config.ts"
  }
}
```

```bash
pnpm naviql-codegen --config ./naviql.config.ts
pnpm naviql-codegen --config ./naviql.config.ts --dry-run
```

Flags: `--config`, `--out`, `--root`, `--dry-run`, `--help`. CLI wins over config (with a warning). `include` / `exclude` / `pathFilter` are config-only. Diagnostics → exit `1` and no write.

One config = one `out`. Multiple targets = multiple config files or scripts.

Generated modules import runtime symbols (`ari`, `s`, `createGraphResolutionStrategy`, `createResourceGraphResolver`, `ContentMap`, …) from `@xndrjs/naviql` (override with `importFrom` if needed). App code should use that same runtime entry — never `/compile`.

## Usage

Client / runtime — import from the main entry only:

```ts
import {
  createResourceGraphResolver,
  createGraphResolutionStrategy,
  ari,
  s,
  type ContentMap,
} from "@xndrjs/naviql";
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
  buildResources,
  type Program,
} from "@xndrjs/naviql/compile";

const { program, diagnostics } = parseAndCheck(source);
if (diagnostics.length === 0) {
  const { code: resources } = generateResources(program);
  const { code: strategies } = generateStrategies(program);
  const { code: projections } = generateProjections(program);
  // Pure TypeScript source strings — CLI / buildResources compose + write.
}

// Multi-file pipeline (no FS write — CLI persists when diagnostics are empty):
const result = buildResources({ root: process.cwd() });
```

`generateResources` emits branded scalar types, ARI factories (`postAri`), payload types (`PostPayload`), and a `ContentRegistry` slice from a checked `Program`. Queries are ignored.

`generateStrategies` emits one open `create*Strategy` fluent builder per query (params/context types + `.expansion.on(…).expand(…)`). Armed `on` projections emit one `.on(ari).when(…).expand(…)` per expanding arm; flat `on` stays `.on(ari).expand(…)`. Many-expands use `each` (multi-arm `when` → order-preserving `flatMap`); collection expand targets fan out member ARIs. The factory returns the builder **without** `.build()`, so apps can attach island policies by hand before calling `.build()`. Islands are not emitted.

`generateProjections` emits memoized `project*` materializers and query-scoped result types (`PostDetailResult`, `PostDetail_Post`, …) with `$type` discriminators. Apps pass a resolved `ContentMap` and seed ARI(s); aliases are restored. Generated code imports `ContentMap` from `@xndrjs/naviql` only — no extra runtime helper.

`buildResources` / `naviql-codegen` also emit a closed `resolve*` façade per query (`resolvePostDetail`, …): takes `createResourceGraphResolver` config minus `strategy`, plus `resolve` input and query params; runs strategy → resolve → project; returns `{ postDetail, contentMap, islands, islandDependencies, errors, promotedResourceKeys }`. `create*Strategy` and `project*` remain exported for low-level use.

`buildResources` / `naviql-codegen` compose resources + strategies + projections + resolve façades into one module when queries exist. Generated imports stay on `@xndrjs/naviql` only.

### `refers` field annotations

Object fields may declare intended expand targets with `refers` (types + check only — no runtime assert):

```naviql
menuId: EntryId refers Entry with { type: "Menu" }
chromeId: EntryId refers Entry with { type: "Menu" | "Footer" }
eitherId: EntryId refers Entry with { type: "Menu" } | Entry with { type: "Footer" }
```

`with { … }` is a partial payload pattern: **AND** across fields; each field value is a string literal or `|`-union of literals (**OR** on that field). When an expand constructs a resource from a field that carries `refers`, and the query has armed `on R` variants, codegen narrows the expand alias (e.g. `PageDetail_Entry_Menu` instead of `PageDetail_Entry`). Flat (non-armed) `on R` projections are not structurally narrowed.

### Single-root vs multi-root queries

A query seeds the graph with either one `root` or several aliased entries in `roots { … }` (XOR — not both). Multi-root aliases must be unique. The engine enqueues every seed into one resolution session (shared ContentMap, waiters, and lane scheduler) and runs until closure.

```naviql
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

| Surface          | Single-root                              | Multi-root                                                 |
| ---------------- | ---------------------------------------- | ---------------------------------------------------------- |
| `*Result`        | `PageDetailResult = PageDetail_Page`     | `{ page: Homepage_Page; session: Homepage_UserSession }`   |
| `project*`       | `projectPageDetail(root, contentMap, …)` | `projectHomepage(roots: { page; session }, contentMap, …)` |
| `resolve*` input | `root: ReturnType<typeof pageAri>`       | `roots: { page: …; session: … }`                           |
| Engine call      | `resolve({ roots: [input.root], … })`    | `resolve({ roots: [input.roots.page, …], … })`             |

Generated app code should import runtime symbols from `@xndrjs/naviql`, never from `/compile`. Langium, the checker, and codegen live under `./compile` only so they do not land in client bundles.

## License

MIT
