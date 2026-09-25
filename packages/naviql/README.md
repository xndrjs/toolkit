# @xndrjs/naviql

**Product entry** for NaviQL with two surfaces:

| Export                   | Use for                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `@xndrjs/naviql`         | Runtime façade: resource graph resolver + application-resource (ARI) primitives — browser-safe                                    |
| `@xndrjs/naviql/compile` | Compile-time DSL: semantic IR, `checkProgram`, Langium parse/lower, `parseAndCheck`, `generateResources` — Node / CI / build only |

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
import {
  parseAndCheck,
  checkProgram,
  generateResources,
  type Program,
} from "@xndrjs/naviql/compile";

const { program, diagnostics } = parseAndCheck(source);
if (diagnostics.length === 0) {
  const { code } = generateResources(program);
  // Phase 3: pure TypeScript source string (no filesystem writer yet).
  // Phase 3.5 will add CLI + multi-file collect / write.
}
```

`generateResources` emits branded scalar types, ARI factories (`postAri`), payload types (`PostPayload`), and a `ContentRegistry` slice from a checked `Program`. Queries are ignored. The returned module imports `{ ari, s }` from `@xndrjs/naviql` only.

Generated app code should import runtime symbols from `@xndrjs/naviql`, never from `/compile`. Langium, the checker, and codegen live under `./compile` only so they do not land in client bundles.

## License

MIT
