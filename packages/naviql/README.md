# @xndrjs/naviql

**Product entry** for NaviQL with two surfaces:

| Export                   | Use for                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@xndrjs/naviql`         | Runtime façade: resource graph resolver + application-resource (ARI) primitives — browser-safe                                                             |
| `@xndrjs/naviql/compile` | Compile-time DSL: IR, `checkProgram`, Langium parse/lower, `parseAndCheck`, `generateResources`, `defineConfig`, `buildResources` — Node / CI / build only |
| `naviql-codegen` (bin)   | CLI: load `naviql.config.ts`, collect `.naviql` files, emit TypeScript — writes `out` or `--dry-run` to stdout                                             |

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

Generated modules import `{ ari, s }` from `@xndrjs/naviql` (override with `importFrom` if needed). App code should use that same runtime entry — never `/compile`.

## Usage

Client / runtime — import from the main entry only:

```ts
import { createResourceGraphResolver, createGraphResolutionStrategy, ari, s } from "@xndrjs/naviql";
```

Build / codegen / typecheck tooling — use the compile subpath:

```ts
import {
  defineConfig,
  parseAndCheck,
  checkProgram,
  generateResources,
  buildResources,
  type Program,
} from "@xndrjs/naviql/compile";

const { program, diagnostics } = parseAndCheck(source);
if (diagnostics.length === 0) {
  const { code } = generateResources(program);
  // Pure TypeScript source string — CLI / buildResources handle collect + write.
}

// Multi-file pipeline (no FS write — CLI persists when diagnostics are empty):
const result = buildResources({ root: process.cwd() });
```

`generateResources` emits branded scalar types, ARI factories (`postAri`), payload types (`PostPayload`), and a `ContentRegistry` slice from a checked `Program`. Queries are ignored. The returned module imports `{ ari, s }` from `@xndrjs/naviql` only.

Generated app code should import runtime symbols from `@xndrjs/naviql`, never from `/compile`. Langium, the checker, and codegen live under `./compile` only so they do not land in client bundles.

## License

MIT
