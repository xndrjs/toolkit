# @xndrjs/naviql

**Product entry** for NaviQL with two surfaces:

| Export                   | Use for                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `@xndrjs/naviql`         | Runtime façade: resource graph resolver + application-resource (ARI) primitives — browser-safe               |
| `@xndrjs/naviql/compile` | Compile-time DSL: semantic IR, `checkProgram`, Langium parse/lower, `parseAndCheck` — Node / CI / build only |

Prefer this package for app code. Depend on [`@xndrjs/resource-graph-resolver`](../resource-graph-resolver) directly only when you need the engine without the DSL.

Full engine guide: [Resource graph resolver](https://www.xndrjs.dev/v0/infrastructure/resource-graph-resolver/) on the xndrjs docs site.

## Installation

```bash
pnpm add @xndrjs/naviql
```

## Usage

Client / runtime — import from the main entry only:

```ts
import { createResourceGraphResolver, createGraphResolutionStrategy, ari, s } from "@xndrjs/naviql";
```

Build / codegen / typecheck tooling — use the compile subpath:

```ts
import { parseAndCheck, checkProgram, type Program } from "@xndrjs/naviql/compile";

const { program, diagnostics } = parseAndCheck(source);
```

Generated app code should import runtime symbols from `@xndrjs/naviql`, never from `/compile`. Langium and the checker live under `./compile` only so they do not land in client bundles.

## License

MIT
