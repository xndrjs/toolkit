# @xndrjs/naviql

**Product entry** for NaviQL: a single install that re-exports the resource graph resolver engine and application-resource (ARI) primitives, plus the NaviQL DSL stack (semantic IR, typechecker, and later parser/codegen — currently WIP).

Prefer this package for app code. Depend on [`@xndrjs/resource-graph-resolver`](../resource-graph-resolver) directly only when you need the engine without the DSL.

Full engine guide: [Resource graph resolver](https://www.xndrjs.dev/v0/infrastructure/resource-graph-resolver/) on the xndrjs docs site.

## Installation

```bash
pnpm add @xndrjs/naviql
```

## Usage

```ts
import { createResourceGraphResolver, createGraphResolutionStrategy, ari, s } from "@xndrjs/naviql";
```

NaviQL language APIs (IR, `checkProgram`, `.naviql` compile) will land in this package as the DSL matures.

## License

MIT
