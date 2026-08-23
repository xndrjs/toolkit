# @xndrjs/resource-graph-resolver

Application-layer **content resource graph** resolution: typed `ContentMap`, island membership, expansion policies, pull-based data loading, and portable island serialization.

Full guide: [Resource graph resolver](https://www.xndrjs.dev/v0/infrastructure/resource-graph-resolver/) on the xndrjs docs site.

## Installation

```bash
npm install @xndrjs/resource-graph-resolver @xndrjs/application-resources
```

## Quick start

```ts
import { ResolveContentGraphEngine } from "@xndrjs/resource-graph-resolver";

const engine = new ResolveContentGraphEngine<AppContentRegistry, ExecutionContext>(
  dataGateway,
  expansionPort
);

const output = await engine.execute({
  root: pageRoot,
  executionContext: { locale: "en-US" },
  missingResourceMode: "throw",
});

output.contentMap.get(pageRoot);
output.islandDependencies.getFlatDependencies(pageRoot.toString());
```

## Concepts

- **`ContentRegistry`** — map ARI `type` literals to payload shapes; `ContentMap.get` follows `resource.type`.
- **`DataResolutionPort`** — pull-based batch loading via `process({ take })`.
- **`ExpansionPort`** — discover child ARIs; `isIsland: true` starts a new island boundary.
- **`IslandDependencyMap`** — direct edges between islands; `getFlatDependencies` for transitive cache manifests.
- **`serializeAllIslands`** — cache-ready payloads (`SerializedIsland`, schema v1).

## Demo

See [`apps/resource-graph-resolver-demo`](https://github.com/xndrjs/toolkit/tree/main/apps/resource-graph-resolver-demo) for Contentful-shaped fixtures, tiered island cache, and domain-zod aggregation.

## License

MIT
