# @xndrjs/resource-graph-resolver

Application-layer **content resource graph** resolution: typed `ContentMap`, island membership, expansion policies, pull-based data loading, and portable island serialization.

Full guide: [Resource graph resolver](https://www.xndrjs.dev/v0/infrastructure/resource-graph-resolver/) on the xndrjs docs site.

## Installation

```bash
npm install @xndrjs/resource-graph-resolver @xndrjs/application-resources
```

## Quick start

Barrier walk (gateway + round barrier):

```ts
import { BarrierResolveContentGraphEngine } from "@xndrjs/resource-graph-resolver";

const engine = new BarrierResolveContentGraphEngine<AppContentRegistry, ExecutionContext>(
  dataGateway,
  expansionPort
);

const output = await engine.execute({
  root: pageRoot,
  executionContext: { locale: "en-US" },
  missingResourceMode: "throw",
  // optional:
  // signal: AbortSignal.timeout(5_000),
  // limits: { maxRounds: 50, maxResources: 2_000, maxDepth: 32 },
});

output.contentMap.get(pageRoot);
output.islandDependencies.getFlatDependencies(pageRoot.toString());
```

Lane walk (ordered source loaders, serial per lane):

```ts
import {
  LaneResolveContentGraphEngine,
  type ResourceLoader,
} from "@xndrjs/resource-graph-resolver";

const loaders: readonly ResourceLoader<AppContentRegistry>[] = [cmsLoader, integrationLoader];

const engine = new LaneResolveContentGraphEngine(loaders, expansionPort);
const output = await engine.execute({
  root: pageRoot,
  executionContext,
  missingResourceMode: "throw",
});
```

## Walk strategies

Both engines share the same `execute` contract and graph semantics (islands, backing promotion, missing resources, cycles, cancellation). Choose how the frontier advances:

| Strategy                                         | Construct from                                            | Scheduler                                                                                                              | When to prefer                                                    |
| ------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Barrier** (`BarrierResolveContentGraphEngine`) | one `DataResolutionPort` (usually a multi-source gateway) | Each round waits for the whole `process` before expand                                                                 | Simple composition; round traces; backends of similar latency     |
| **Lane** (`LaneResolveContentGraphEngine`)       | ordered `ResourceLoader[]` + `ExpansionPort`              | Each loader is a lane with **exactly one** in-flight `process`; lanes may overlap; expand runs as each batch completes | Uneven source latency; fast sources should not wait on slow peers |

**Trade-off:** barrier mode keeps multi-source IO behind one gateway round. Lane mode routes ARIs by chain-of-responsibility (`accepts` order; callers guarantee one owner per ARI). A fast CMS lane can start its next batch as soon as its previous batch is committed and expanded, while a slow integration batch stays pending — wall-clock no longer tracks the slowest peer in every wave.

Do not overload `DataResolutionPort` for lane routing; use `ResourceLoader` (`accepts` + `process`).

## Concepts

- **`ContentRegistry`** — map ARI `type` literals to payload shapes; `ContentMap.get` follows `resource.type`.
- **`DataResolutionPort`** — barrier engine’s pull-based batch loading via `process({ take })`; returns `{ resource, payload }` records. Empty `take` batches should skip IO.
- **`ResourceLoader`** — lane engine’s source-owned lane: `accepts(resource)` plus the same pull `process`; at most one in-flight call per loader.
- **`ExpansionPort`** — discover child ARIs from **current resource + payload + execution context** only; `isIsland: true` starts a new island boundary.
- **`IslandDependencyMap`** — direct edges between islands; `getFlatDependencies` for transitive cache manifests (cycles excluded from the start island).
- **Termination** — unresolved work with no eligible take / idle lane progress is no-progress (throw or collect via `missingResourceMode`), distinct from intentional deferral after a non-empty take.
- **`serializeAllIslands`** — cache-ready payloads (`SerializedIsland`, schema v1).

## Demo

See [`apps/resource-graph-resolver-demo`](https://github.com/xndrjs/toolkit/tree/main/apps/resource-graph-resolver-demo) for Contentful-shaped fixtures, tiered island cache, domain-zod aggregation, and side-by-side `/barrier` vs `/lane` routes.

## License

MIT
