# @xndrjs/resource-graph-resolver-bench

CLI for comparing **lane** vs **barrier** scheduling in `@xndrjs/resource-graph-resolver` on synthetic CMS graphs plus product leaves — and for comparing the resolver against handwritten **naive** / **batched** walks.

This is a private workspace app (not published). It reuses the _style_ of `@xndrjs/domain-bench` (matrix, warmup/repeats, JSON + markdown under `results/`), not its validation-engine domain.

## What is measured

Cold-path **expansion loading** only:

- no `isIsland`, island maps, island cache, or `backingResources`;
- no serialize/cache;
- no membership or island-dependency scenarios.

Two graph **profiles**:

| Profile                     | Shape                                                                                     | Products                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **`pagebuilder`** (default) | Wide page fan-out (`modules`), shallow nesting (`depth`), section branch factor (`arity`) | Mixed depths: every `productStride`-th sibling terminates early as a product module |
| **`tree`**                  | Regular tree (`depth` × `arity`)                                                          | Only at leaves                                                                      |

Three **orchestration** modes (`--orchestration`):

| Mode                     | What runs                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------ |
| **`resolver`** (default) | `createResourceGraphResolver` — `schedulingMode` (lane/barrier) applies              |
| **`naive`**              | Handwritten BFS — one RTT per resource (batch size 1)                                |
| **`batched`**            | Handwritten BFS — DataLoader-style frontier flush, chunked by configured batch sizes |

CMS and integration sources apply a **per-load** sleep (`cmsLatencyMs` / `integrationLatencyMs`) so cost tracks batch RTT, not per-item work.

**Total resources resolved** = CMS nodes + products.

### Sizing (pagebuilder defaults)

Aimed at a heavy CMS page (~1k–1.5k in real projects), with headroom under ~3k.

| modules | depth | arity | stride | CMS | products | **total** |
| ------: | ----: | ----: | -----: | --: | -------: | --------: |
|      32 |     5 |     3 |      3 | 474 |      326 |   **800** |
|      48 |     5 |     3 |      3 | 721 |      496 | **1 217** |
|      64 |     5 |     3 |      3 | 947 |      652 | **1 599** |

Early products (stride) let integration loads start while other modules are still expanding — the case where lane vs barrier should diverge.

Safety: generation fails if expected CMS nodes exceed `--max-nodes` (default 10 000).

Regular `tree` sizes (for `--profile tree`): depth 7 × arity 3 ≈ 1.8k total; depth 10 × arity 3 ≈ 49k (stress only).

## Commands

### Fast local iteration from source

```bash
pnpm --filter @xndrjs/resource-graph-resolver-bench bench:dev -- --modules 32 --scheduling-mode lane --repeats 1
```

### Built artifacts (recommended for comparable runs)

```bash
pnpm --filter @xndrjs/resource-graph-resolver-bench bench -- --modules 32 --scheduling-mode lane --repeats 1
```

`bench` builds `@xndrjs/addressable-resources`, `@xndrjs/resource-graph-resolver`, and this app, then runs `dist/index.js`.

### Compare orchestration modes

```bash
# Resolver (default)
pnpm --filter @xndrjs/resource-graph-resolver-bench bench:dev -- --modules 32 --orchestration resolver --repeats 1 --warmup 0

# Naive (one RTT per resource)
pnpm --filter @xndrjs/resource-graph-resolver-bench bench:dev -- --modules 32 --orchestration naive --repeats 1 --warmup 0

# Batched frontier walk
pnpm --filter @xndrjs/resource-graph-resolver-bench bench:dev -- --modules 32 --orchestration batched --repeats 1 --warmup 0
```

Baseline `--matrix` keeps `orchestration=resolver` only. Pass `--orchestration naive` or `batched` to shrink that axis for comparison runs.

### Default matrix (pagebuilder)

```bash
pnpm --filter @xndrjs/resource-graph-resolver-bench bench:matrix
```

Baseline `--matrix` uses **pagebuilder** with `modules ∈ {32,48,64}` (~0.8–1.6k resources):

| Dimension              | Values             |
| ---------------------- | ------------------ |
| `profile`              | `pagebuilder`      |
| `modules`              | `32`, `48`, `64`   |
| `depth`                | `5`                |
| `arity`                | `3`                |
| `productStride`        | `3`                |
| `orchestration`        | `resolver`         |
| `schedulingMode`       | `lane`, `barrier`  |
| `cmsBatchSize`         | `50`, `100`, `200` |
| `integrationBatchSize` | `100`              |
| `cmsLatencyMs`         | `20`               |
| `integrationLatencyMs` | `80`               |

Default concurrency is **1** per source. Single-run default is `modules=48` (~1.2k resources).

Shorter smoke:

```bash
pnpm --filter @xndrjs/resource-graph-resolver-bench bench:dev -- --matrix --modules 32 --repeats 1
```

### Regular tree matrix

```bash
pnpm --filter @xndrjs/resource-graph-resolver-bench bench:dev -- --matrix --profile tree
```

### Single-run flags

`--profile`, `--modules`, `--depth`, `--arity`, `--product-stride`, `--orchestration`, `--scheduling-mode`, `--cms-batch-size`, `--integration-batch-size`, `--cms-latency-ms`, `--integration-latency-ms`, `--warmup` (default 1), `--repeats` (default 5), `--max-nodes`, `--output-dir`.

`--list` lists matrix cells without running them.

## Output

Each run writes under `results/<iso-stamp>/` (override with `--output-dir`):

- `raw.json` — every measured repeat
- `summary.json` — aggregates (median / p95 / p99)
- `comparison.md` — tables for wall median, batch count, and **effective batch size** (mean/median per source), with `%` delta lane vs barrier for the same shape + `cmsBatchSize`

## How to read comparison.md

1. At the same graph and configured batch size, does **lane reduce wall clock** vs barrier when `integrationLatency ≫ cmsLatency`?
2. How do **`batchCount` and wall** scale as `modules` (page size) grows and `cmsBatchSize` changes?
3. At the same configured `cmsBatchSize` max, how do **effective** batch sizes (mean / median / p95) differ between lane and barrier — including the share of full vs under-filled batches?
4. Against the same graph, how do **`naive` / `batched`** wall and batch counts compare to **`resolver`** (lane)?

Effective size is `onBatchStart.resourceCount` (the real load size), not the configured cap. On pagebuilder graphs, early product modules should increase CMS∥integration overlap for lane.

## Out of scope

- Islands (`isIsland`, island map/deps), island cache, backing warm / `promotedResourceKeys`
- Shared SKUs / DAG diamonds (possible follow-up)
- CPU-only benches (expansion memoization) — this suite is about fake network latency
- HTML or interactive charts — markdown + JSON only

## Verification

```bash
pnpm --filter @xndrjs/resource-graph-resolver-bench typecheck
pnpm --filter @xndrjs/resource-graph-resolver-bench bench:dev -- --modules 32 --scheduling-mode lane --repeats 1 --warmup 0
# Use zero latency for orchestration smoke (naive is O(resources) RTTs otherwise)
pnpm --filter @xndrjs/resource-graph-resolver-bench bench:dev -- --modules 32 --orchestration naive --cms-latency-ms 0 --integration-latency-ms 0 --repeats 1 --warmup 0
pnpm --filter @xndrjs/resource-graph-resolver-bench bench:dev -- --modules 32 --orchestration batched --cms-latency-ms 0 --integration-latency-ms 0 --repeats 1 --warmup 0
```
