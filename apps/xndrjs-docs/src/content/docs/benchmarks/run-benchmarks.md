---
title: Run benchmarks
description: Commands and interpretation guide for @xndrjs/bench-perf
order: 2
seeAlso: |
  - [Benchmarks overview](./overview.md)
---

# Run benchmarks

Run from monorepo root.

## Reproducible run (recommended)

```bash
pnpm --filter @xndrjs/bench-perf bench -- --scenario fe-medium-form --engine zod --mode valid --input-size 10000 --warmup 1000 --repeats 7 --seed 42
```

This command builds required packages first, then runs from compiled artifacts.

## Fast local iteration

```bash
pnpm --filter @xndrjs/bench-perf bench:dev -- --scenario fe-medium-form --engine zod --mode valid --input-size 10000 --warmup 1000 --repeats 7 --seed 42
```

## Matrix run (all engines)

```bash
pnpm --filter @xndrjs/bench-perf bench:matrix -- --scenario migration-batch --mode valid --input-size 100000 --warmup 1000 --repeats 7 --seed 42
```

## Result output

Default directory format:

`results/<scenario>/<utc-timestamp>-<commit-hash>/<mode>-<input-size>/`

Generated artifacts:

- per-engine JSON outputs
- `comparison.md` summary

## How to read metrics

- `opsPerSec`: higher is better
- `msPerOp`: lower is better
- `heapDeltaBytes`: relative trend signal, not an absolute truth

Always compare engines on the same scenario, mode, seed, input size, warmup, and repeats.
