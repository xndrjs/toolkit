# Architecture

Visual overview of `@xndrjs/resource-graph-resolver`: how pieces fit together, how a resolve walk runs, how `lane` and `barrier` differ, and how islands track shared resources.

Narrative guide: [Resource graph resolver](https://www.xndrjs.dev/v0/infrastructure/resource-graph-resolver/) on the docs site.

## Component wiring

You declare **sources** (one per backend) and an **expansion** port. The resolver owns routing, chunking, concurrency, scheduling, and island bookkeeping. Application code maps the resulting `ContentMap` into domain aggregates and may serialize islands for cache.

```mermaid
flowchart LR
  app[Application use case] --> resolve["resolver.resolve"]
  resolve --> session[ResolutionSession]
  session --> contentMap[ContentMap]
  session --> islandMap[IslandMap]
  session --> deps[IslandDependencyMap]

  subgraph config [Resolver config]
    sources[ResourceSource list]
    expansion[ExpansionPort]
    strategy[strategy lane or barrier]
    observer[ResolutionObserver optional]
  end

  resolve --> config
  sources --> load["source.load batch"]
  expansion --> children[Child ARIs plus isIsland]
  children --> resolve
  load --> contentMap

  contentMap --> mapper[Domain mapper]
  contentMap --> serialize[serializeAllIslands]
  serialize --> cache[Island cache optional]
  cache --> backing[backingResources]
  backing --> resolve
```

## Ownership split

| Owner              | Responsibility                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Resolver**       | Route by ARI `type` + family `matches`, chunk to `batchSize`, throttle to `concurrency`, schedule loads, dedupe fetches, expand, track islands |
| **ResourceSource** | Declare owned families, fetch one narrowed batch, retry/backoff inside `load`                                                                  |
| **ExpansionPort**  | Discover children from **current resource + payload + execution context** only                                                                 |
| **Application**    | ARIs, registry, orchestration, domain mapping, cache TTL/invalidation                                                                          |

## Resolve loop

Each walk step is a `GraphWalkRef` (ARI + island context). The work queue is drained non-recursively. Already-resolved ARIs expand immediately; backing hits promote without IO; otherwise the ARI is routed onto a source lane and loaded in batches.

```mermaid
flowchart TD
  seed["Seed root as its own island"] --> drain[Drain work queue]
  drain --> visit{Visit ref}

  visit -->|already in ContentMap| expand[Expand in this island]
  visit -->|already failed| miss[Missing or collect error]
  visit -->|first waiter| remember[rememberWaiter]
  visit -->|extra waiter only| wait[Record island and stop]

  remember --> backing{Backing hit?}
  backing -->|yes| promote[Promote payload and settle waiters]
  promote --> expand
  backing -->|no| route{Source family matches?}

  route -->|no| noSource[NoResourceSourceError]
  route -->|yes| pending[Enqueue on source family pending]

  pending --> fill[Start loads while inFlight less than concurrency]
  fill --> waitLoads{strategy}
  waitLoads -->|lane| race[Await first load completion]
  waitLoads -->|barrier| all[Await all in-flight loads]

  race --> commit[Commit records or attribute failures]
  all --> commit
  commit --> expand
  expand --> children[Enqueue child refs]
  children --> drain

  miss --> more{More work or in-flight?}
  noSource --> more
  wait --> more
  fill --> more
  more -->|yes| drain
  more -->|no| output[Return ContentMap islands deps errors]
```

## Lane vs barrier

Both strategies produce the **same** graph output. They differ only in when expansion runs relative to in-flight loads.

```mermaid
sequenceDiagram
  participant Q as Work queue
  participant Cms as Source cms
  participant Api as Source products
  participant Exp as Expansion

  Note over Q,Exp: lane — expand as soon as any batch commits
  Q->>Cms: load entries batch
  Q->>Api: load products batch
  Cms-->>Q: cms records
  Q->>Exp: expand cms nodes
  Exp-->>Q: more cms children
  Q->>Cms: next cms load while products still open
  Api-->>Q: product records
  Q->>Exp: expand products

  Note over Q,Exp: barrier — wait for every in-flight load before expand
  Q->>Cms: load entries batch
  Q->>Api: load products batch
  Cms-->>Q: cms records
  Api-->>Q: product records
  Q->>Exp: expand all committed nodes together
```

Prefer **lane** when backend latencies diverge (CMS vs commercial API). Prefer **barrier** for reproducible rounds in traces and tests.

## Source routing and batches

Routing is by ARI `type`, then the first family whose `matches` accepts the ARI. The resolver builds a narrowed batch per family and caps each family to `batchSize`. A source may run up to `concurrency` loads in parallel.

```mermaid
flowchart LR
  ari[Discovered ARI] --> byType[Lookup routesByAriType]
  byType --> match[First family.matches]
  match --> lanePending[Source lane pending by family]
  lanePending --> chunk["Chunk to batchSize"]
  chunk --> loadFn["source.load pendingBatch, context"]
  loadFn --> records["SourceResourceRecord list"]
  records --> commit[Commit into ContentMap]
```

Example topology (demo-shaped):

```mermaid
flowchart TB
  subgraph cmsSource [ResourceSource id cms]
    entryFam["family entry → cms.entry"]
    assetFam["family asset → cms.asset"]
  end

  subgraph productSource [ResourceSource id integration]
    productFam["family product → integration.product"]
  end

  pageAri["cms.entry page"] --> entryFam
  heroAri["cms.entry hero"] --> entryFam
  logoAri["cms.asset logo"] --> assetFam
  skuAri["integration.product sku"] --> productFam
```

## Islands: membership vs dependencies

An island is a walk subgraph with its own identity. Expansion returning `isIsland: true` opens a new island; the parent records a **dependency** edge. Resources discovered while expanding under that island are **members**, not separate islands.

```mermaid
flowchart TB
  pageIsland["Island page"]
  menuIsland["Island menu"]
  footerIsland["Island footer"]

  pageIsland -->|depends on| menuIsland
  pageIsland -->|depends on| footerIsland

  pageIsland --- pageNode["member: page"]
  pageIsland --- heroNode["member: hero"]
  pageIsland --- productNode["member: product entry"]

  menuIsland --- menuNode["member: menu"]
  menuIsland --- logoA["member: logo asset"]

  footerIsland --- footerNode["member: footer"]
  footerIsland --- logoB["member: logo asset"]
```

Membership and dependency are separate: the page island may depend on `menu` without containing menu payloads. `getFlatDependencies(page)` returns the transitive island closure for cache manifests.

Islands are for **macro-grouping** (lifecycle / reuse boundaries). Fine-grained islands over a shared subgraph multiply membership entries.

## Shared resources and waiters

A resource reachable from several islands is **fetched once**. The session keeps a waiter set of island ids; after commit, expansion runs once per waiting island so membership is recorded in all of them.

```mermaid
sequenceDiagram
  participant Menu as Island menu
  participant Footer as Island footer
  participant Sess as ResolutionSession
  participant Src as ResourceSource cms

  Menu->>Sess: discover logo ARI
  Sess->>Sess: rememberWaiter menu
  Sess->>Src: enqueue logo

  Footer->>Sess: discover same logo ARI
  Sess->>Sess: rememberWaiter footer no second fetch

  Src-->>Sess: logo payload
  Sess->>Sess: settle waiters menu plus footer
  Sess->>Menu: expand logo in menu
  Sess->>Footer: expand logo in footer
```

Backing promotion follows the same waiter rule: a hit is expanded for every island that was waiting, and the caller's `backingResources` map is never mutated (`promotedResourceKeys` reports what the walk used).

## Output and downstream

```mermaid
flowchart LR
  output[ResolveResourceGraphOutput] --> cm[contentMap]
  output --> im[islands]
  output --> idm[islandDependencies]
  output --> err[errors]
  output --> promo[promotedResourceKeys]

  cm --> domain[Domain aggregate]
  im --> ser[serializeAllIslands]
  idm --> ser
  err --> ser
  ser --> cached[SerializedIsland cache]
  cached --> rebuild[buildBackingResourcesFromIslands]
  rebuild --> next[Next resolve backingResources]
```

## Error model

| Situation                            | `throw`                     | `collect`                                     |
| ------------------------------------ | --------------------------- | --------------------------------------------- |
| Source omitted a requested ARI       | `MissingResourceError`      | Error entry per waiting islands               |
| No source declares a matching family | `NoResourceSourceError`     | Error entry (wiring bug)                      |
| `load` rejected                      | `ResourceLoadFailedError`   | Errors for that batch; other sources continue |
| Abort signal                         | `ResourceGraphAbortedError` | Always throws                                 |

All extend `ResourceGraphError`. Observer hooks never affect the walk: a throwing observer is swallowed.
