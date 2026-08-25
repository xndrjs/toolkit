# @xndrjs/resource-graph-resolver-bench

CLI for comparing **lane** vs **barrier** scheduling in `@xndrjs/resource-graph-resolver` on a synthetic CMS tree plus product leaves.

This is a private workspace app (not published). It reuses the _style_ of `@xndrjs/bench-perf` (matrix, warmup/repeats, JSON + markdown under `results/`), not its validation-engine domain.

## What is measured

Cold-path **expansion loading** only:

- no `isIsland`, island maps, island cache, or `backingResources`;
- no serialize/cache;
- no membership or island-dependency scenarios.

The graph is a regular tree of CMS nodes (`bench.node`) at fixed **depth** `D` (default **10**) with **arity** `A` (children per CMS node). Each CMS leaf expands to **one** integration product (`bench.product`). CMS and integration sources apply a **per-load** sleep (`cmsLatencyMs` / `integrationLatencyMs`) so cost tracks batch RTT, not per-item work.

CMS node count for a full tree: `(A^D - 1) / (A - 1)` when `A > 1`, or `D` when `A = 1`.

Safety: generation fails if expected CMS nodes exceed `--max-nodes` (default 50_000). With `D=10`, `A=2` is about 1k CMS nodes; `A=3` about 29k; `A=4` is far larger and is not in the default matrix.

## Commands

### Fast local iteration from source

```bash
pnpm --filter @xndrjs/resource-graph-resolver-bench bench:dev -- --depth 4 --arity 2 --strategy lane --repeats 1
```

### Built artifacts (recommended for comparable runs)

```bash
pnpm --filter @xndrjs/resource-graph-resolver-bench bench -- --depth 4 --arity 2 --strategy lane --repeats 1
```

`bench` builds `@xndrjs/application-resources`, `@xndrjs/resource-graph-resolver`, and this app, then runs `dist/index.js`.

### Default matrix

```bash
pnpm --filter @xndrjs/resource-graph-resolver-bench bench:matrix
```

Default dimensions (`--matrix`):

| Dimension              | Values             |
| ---------------------- | ------------------ |
| `depth`                | `10`               |
| `arity`                | `1`, `2`, `3`      |
| `strategy`             | `lane`, `barrier`  |
| `cmsBatchSize`         | `50`, `100`, `200` |
| `integrationBatchSize` | `100`              |
| `cmsLatencyMs`         | `20`               |
| `integrationLatencyMs` | `80`               |

Default concurrency is **1** per source (serial lane). `--cms-concurrency` is available for later experiments; it is not part of the baseline matrix.

`depth: 10` with `arity: 3` is tens of thousands of CMS nodes. With the default fake latencies, a full matrix is on the order of **minutes**. Use a shorter tree for smoke:

```bash
pnpm --filter @xndrjs/resource-graph-resolver-bench bench:dev -- --matrix --depth 6 --repeats 1
```

### Single-run flags

`--depth`, `--arity`, `--strategy`, `--cms-batch-size`, `--integration-batch-size`, `--cms-latency-ms`, `--integration-latency-ms`, `--warmup` (default 1), `--repeats` (default 5), `--max-nodes`, `--output-dir`.

`--list` lists matrix cells without running them.

## Output

Each run writes under `results/<iso-stamp>/` (override with `--output-dir`):

- `raw.json` — every measured repeat
- `summary.json` — aggregates (median / p95 / p99)
- `comparison.md` — tables for wall median, batch count, and **effective batch size** (mean/median per source), with `%` delta lane vs barrier for the same `(arity, cmsBatchSize)`

## How to read comparison.md

1. At the same graph and configured batch size, does **lane reduce wall clock** vs barrier when `integrationLatency ≫ cmsLatency`?
2. How do **`batchCount` and wall** scale as `arity` grows and `cmsBatchSize` changes?
3. At the same configured `cmsBatchSize` max, how do **effective** batch sizes (mean / median / p95) differ between lane and barrier — including the share of full vs under-filled batches?

Effective size is `onBatchStart.resourceCount` (the real load size), not the configured cap. Barrier tends to fill batches more; lane often starts earlier with smaller batches and more round-trips.

## Out of scope

- Islands (`isIsland`, island map/deps), island cache, backing warm / `promotedResourceKeys`
- CPU-only benches (expansion memoization) — this suite is about fake network latency
- HTML or interactive charts — markdown + JSON only

## Typecheck

```bash
pnpm --filter @xndrjs/resource-graph-resolver-bench typecheck
```
