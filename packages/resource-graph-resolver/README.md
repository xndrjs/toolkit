# @xndrjs/resource-graph-resolver

Infrastructure-layer **resource graph** resolution: typed `ContentMap`, island membership, expansion policies, declarative multi-backend sources, and portable island serialization.

Full guide: [Resource graph resolver](https://www.xndrjs.dev/v0/infrastructure/resource-graph-resolver/) on the xndrjs docs site.

## Installation

```bash
npm install @xndrjs/resource-graph-resolver @xndrjs/application-resources
```

## Quick start

Declare one source per backend. A source owns ARI **families**, declares the backend's per-family batch limits and how many requests it tolerates in parallel, then fetches a batch the resolver hands it:

```ts
import { defineDataSourceFor } from "@xndrjs/resource-graph-resolver";

const defineSource = defineDataSourceFor<AppContentRegistry, ExecutionContext>();

const cmsSource = defineSource({
  id: "cms",
  families: { entry: cmsEntryAri, asset: cmsAssetAri },
  batchSize: { entry: 100, asset: 100 },
  async load({ entry, asset }, { signal }) {
    // entry: readonly CmsEntryResource[], asset: readonly CmsAssetResource[]
    const [entries, assets] = await Promise.all([
      fetchEntries(entry, signal),
      fetchAssets(asset, signal),
    ]);

    return [...entries, ...assets];
  },
});

const productSource = defineSource({
  id: "products",
  families: { product: productAri },
  batchSize: { product: 1 },
  concurrency: 4,
  load: ({ product }, { signal }) => fetchProducts(product, signal),
});
```

Then wire one resolver and reuse it per request:

```ts
import { createResourceGraphResolver, createStrategy } from "@xndrjs/resource-graph-resolver";

function createAppStrategy() {
  const s = createStrategy<ExecutionContext, AppContentRegistry>();

  s.expansion.on(cmsEntryAri).expand(({ payload }) => ({ resources: collectChildAris(payload) }));

  s.islands
    .on(cmsEntryAri)
    .when(({ payload }) => payload.sys.contentType.sys.id === "menu")
    .startIsland();

  return s.build();
}

const resolver = createResourceGraphResolver<AppContentRegistry, ExecutionContext>({
  sources: [cmsSource, productSource],
  strategy: createAppStrategy(),
  schedulingMode: "lane",
});

const output = await resolver.resolve({
  root: pageRoot,
  executionContext: { locale: "en-US" },
  missingResourceMode: "throw",
  // optional:
  // backingResources: cachedPayloadsByKey,
  // signal: AbortSignal.timeout(5_000),
});

output.contentMap.get(pageRoot);
output.islandDependencies.getFlatDependencies(pageRoot.toString());
```

## Who owns what

The resolver owns routing (by ARI `type`, then family `matches`), chunking to `batchSize`, throttling to `concurrency`, scheduling, deduplication and island bookkeeping. A source owns one backend's transport, and its retry and backoff policy: a source has at most `concurrency` loads in flight, so awaiting inside `load` throttles that backend and nothing else.

A source signals "no data" by omitting an ARI from its result. The resolver then reports it through `missingResourceMode`, attributed to every island that reached it.

## Scheduling modes

Both scheduling modes share identical graph semantics — same `ContentMap`, islands, dependencies, backing promotion and errors. They differ only in when expansion runs relative to in-flight loads.

| Scheduling mode | Scheduler                                                          | When to prefer                                                              |
| --------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `lane`          | Expand as soon as any batch commits; sources advance independently | Uneven backend latency; a fast CMS should not wait on a slow commercial API |
| `barrier`       | Wait for every in-flight batch, then expand together               | Reproducible rounds for tracing and tests; backends of similar latency      |

Under `lane`, a fast source keeps walking its own subgraph while a slow peer's request is still open, so wall clock stops tracking the slowest backend in every wave.

## Concepts

- **`ContentRegistry`** — maps ARI `type` literals to payload shapes; `ContentMap.get` follows `resource.type`. Compose per-source slices with `ComposeContentRegistry`.
- **`DataSource`** — one backend: the ARI families it owns, its batch limits, its concurrency budget, and `load`.
- **`createStrategy()`** — fluent builder for expansion and island policies; `.build()` returns a `GraphStrategy` for the resolver.
- **`IslandDependencyMap`** — direct edges between islands; `getFlatDependencies` builds transitive cache manifests (cycles excluded from the start island).
- **`backingResources`** — pre-resolved payloads consulted before any source is asked. The map is never mutated; keys the walk actually reached come back as `promotedResourceKeys`.
- **`ResolutionObserver`** — optional hooks for batches, expansions, promotions and misses. Observer failures never affect resolution.
- **Errors** — `ResourceGraphError` base, plus `MissingResourceError`, `NoDataSourceError` (no source declares a matching family — a wiring bug, not missing data), `ResourceLoadFailedError` (wraps a rejected `load`), and `ResourceGraphAbortedError`.
- **`serializeAllIslands`** — cache-ready payloads (`SerializedIsland`, schema v1).

## Demo

See [`apps/resource-graph-resolver-demo`](https://github.com/xndrjs/toolkit/tree/main/apps/resource-graph-resolver-demo) for Contentful-shaped fixtures, tiered island cache, and domain-zod aggregation.

## License

MIT
