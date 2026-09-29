# @xndrjs/resource-graph-resolver

Infrastructure-layer **resource graph** resolution: typed `ContentMap`, island membership, expansion policies, declarative multi-backend sources, and portable island serialization.

Full guide: [Resource graph resolver](https://www.xndrjs.dev/v0/infrastructure/resource-graph-resolver/) on the xndrjs docs site.

## Installation

```bash
npm install @xndrjs/resource-graph-resolver @xndrjs/application-resources
```

## Quick start

Declare one source per transport channel. A source lists the ARI types it handles, declares the channel's batch limit and how many requests it tolerates in parallel, then fetches one heterogeneous batch the resolver hands it:

```ts
import { defineDataSourceFor } from "@xndrjs/resource-graph-resolver";

const defineSource = defineDataSourceFor<AppContentRegistry, ExecutionContext>();

const cmsSource = defineSource({
  id: "cms",
  for: [cmsEntryAri, cmsAssetAri],
  batchSize: 100,
  async load(batch, { signal }) {
    return contentfulDelivery.fetchBatch(batch, { signal });
  },
});

const productSource = defineSource({
  id: "products",
  for: [productAri],
  batchSize: 1,
  concurrency: 4,
  load: (batch, { signal }) => fetchProducts(batch, signal),
});
```

Then wire one resolver and reuse it per request:

```ts
import {
  createResourceGraphResolver,
  createGraphResolutionStrategy,
} from "@xndrjs/resource-graph-resolver";

const strategy = createGraphResolutionStrategy().expansion(/* ... */).islands(/* ... */).build();

const resolver = createResourceGraphResolver({
  sources: [cmsSource, productSource],
  strategy,
  schedulingMode: "lane",
});

const output = await resolver.resolve({
  roots: [pageAri({ id: "home", locale: "en-US" })],
  executionContext: { locale: "en-US" },
});
```

## Scheduling modes

| Scheduling mode | Scheduler                                                          | When to prefer                                                              |
| --------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `lane`          | Expand as soon as any batch commits; sources advance independently | Uneven backend latency; a fast CMS should not wait on a slow commercial API |
| `barrier`       | Wait for every in-flight batch, then expand together               | Reproducible rounds for tracing and tests; backends of similar latency      |

Under `lane`, a fast source keeps walking its own subgraph while a slow peer's request is still open, so wall clock stops tracking the slowest backend in every wave.

## Concepts

- **`ContentRegistry`** — maps ARI `type` literals to payload shapes; `ContentMap.get` follows `resource.type`. Compose per-source slices with `ComposeContentRegistry`.
- **`DataSource`** — one transport channel: the ARI types in `for`, its batch limit, its concurrency budget, and positional `load(batch)` → `(payload | undefined)[]` (same length/order; `undefined` = miss).
- **`createGraphResolutionStrategy()`** — fluent builder for expansion, island, and resolve policies; `.build()` returns a `GraphResolutionStrategy` for the resolver. Use `.resolve.on(ari).when(…).to(…)` for post-decode redirects (identity hops belong here, not in `load`).
- **`IslandDependencyMap`** — direct edges between islands; `getFlatDependencies` builds transitive cache manifests (cycles excluded from the start island).
- **`backingResources`** — pre-resolved payloads consulted before any source is asked. The map is never mutated; keys the walk actually reached come back as `promotedResourceKeys`.
- **`ResolutionObserver`** — optional hooks for batches, expansions, promotions and misses. Observer failures never affect resolution.
- **Errors** — `ResourceGraphError` base, plus `MissingResourceError`, `NoDataSourceError` (no source declares a matching family — a wiring bug, not missing data), `ResourceLoadFailedError` (wraps a rejected `load`), `ResourceBatchLengthError` (wrong result length), and `ResourceGraphAbortedError`. `ResolutionError` is a class (not a plain object): datasources can `throw new ResolutionError(code, message, cause)`; the resolver preserves it (`instanceof`), attributes `resourceKey` / island ids, and collects instances into `output.errors` under soft `onFailure` (`setNull` and `setError`). Projection chooses local shape (`null` vs the `ResolutionError` instance).
- **`onFailure`** — per expansion edge (`ExpansionResult.onFailure`: `"throw"` | `"setNull"` | `"setError"`, default `"throw"`). Roots always throw. Same ARI from multiple edges → strictest wins (`throw` > `setError` > `setNull`). Soft policies always populate `output.errors` (global signal) while projection stays local (`null` / `ResolutionError`). There is no global `missingResourceMode` on `ResolveResourceGraphInput` — soft failures are declared on the discovering edge (Ziel: `on failure set null` / `set error`).
- **`serializeAllIslands`** — cache-ready payloads (`SerializedIsland`, schema v1).

## Demo

See [`apps/resource-graph-resolver-demo`](https://github.com/xndrjs/toolkit/tree/main/apps/resource-graph-resolver-demo) for Contentful-shaped fixtures, tiered island cache, and domain-zod aggregation.

## License

MIT
