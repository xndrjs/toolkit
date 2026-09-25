# @xndrjs/naviql

**Product entry** for NaviQL with two surfaces:

| Export                   | Use for                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@xndrjs/naviql`         | Runtime façade: resource graph resolver + application-resource (ARI) primitives + `ContentMap` — browser-safe                                                                                           |
| `@xndrjs/naviql/compile` | Compile-time DSL: IR, `checkProgram`, Langium parse/lower, `parseAndCheck`, `generateResources`, `generateStrategies`, `generateProjections`, `defineConfig`, `buildResources` — Node / CI / build only |
| `naviql-codegen` (bin)   | CLI: load `naviql.config.ts`, collect `.naviql` files, emit TypeScript (resources + strategies + `project*` materializers) — writes `out` or `--dry-run` to stdout                                      |

Prefer this package for app code. Depend on [`@xndrjs/resource-graph-resolver`](../resource-graph-resolver) directly only when you need the engine without the DSL.

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

Generated modules import runtime symbols (`ari`, `s`, `createGraphResolutionStrategy`, `ContentMap`) from `@xndrjs/naviql` (override with `importFrom` if needed). App code should use that same runtime entry — never `/compile`.

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

`generateStrategies` emits one open `create*Strategy` fluent builder per query (params/context types + `.expansion.on(…).expand(…)`). Aliases are stripped to ARI lists; the factory returns the builder **without** `.build()`, so apps can attach island policies / `.when` by hand before calling `.build()`. Islands and auto-`.when` are not emitted.

`generateProjections` emits memoized `project*` materializers and query-scoped result types (`PostDetailResult`, `PostDetail_Post`, …) with `$type` discriminators. Apps pass a resolved `ContentMap` (and `root` ARI); aliases are restored. Generated code imports `ContentMap` from `@xndrjs/naviql` only — no extra runtime helper.

`buildResources` / `naviql-codegen` compose resources + strategies + projections into one module when queries exist. Generated imports stay on `@xndrjs/naviql` only.

Generated app code should import runtime symbols from `@xndrjs/naviql`, never from `/compile`. Langium, the checker, and codegen live under `./compile` only so they do not land in client bundles.

## License

MIT
