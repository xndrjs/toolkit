# @xndrjs/bench-perf

Benchmark suite for comparing validation engines across realistic workloads:

- `zod`
- `valibot`
- `core` (custom validator contract)
- `raw` baseline (no intermediate validation guarantees)

## Scope and non-goals

This package is for architecture-oriented performance decisions, not for micro-benchmarking isolated lines of code.

Goals:

- measure throughput and latency in realistic scenarios;
- compare valid and invalid paths;
- preserve reproducibility with deterministic seeds and stable runner settings;
- save machine-readable outputs and markdown summaries for historical comparison.

Non-goals:

- prove absolute performance on every hardware/runtime combination;
- optimize for synthetic single-call benchmarks only.

## Methodology

Each run captures:

- warmup iterations (to reduce JIT startup noise);
- repeated measured runs;
- summary stats (`median`, `p95`, `p99`, `variance`);
- heap delta as memory trend signal.

Comparability rules:

- same scenario inputs and seed for all compared engines;
- same mode (`valid`/`invalid`);
- same run parameters (`input-size`, `warmup`, `repeats`).

## Scenarios (MVP)

- `migration-batch`:
  - sizes: `100000`, `500000`;
  - invalid ratio: `1%` for `100000`, `5%` for `500000`;
  - target: migration scripts and bulk processing.
- `fe-medium-form`:
  - sizes: `2000`, `10000`;
  - parse-only validation profile for medium frontend payloads.
- `fe-medium-form-transform`:
  - same payload profile with parse + transform workload.
- `runner-smoke`:
  - minimal deterministic check for runner sanity.

## Commands

### Reproducible run on built artifacts (recommended)

```bash
pnpm --filter @xndrjs/bench-perf bench -- --scenario fe-medium-form --engine zod --mode valid --input-size 10000 --warmup 1000 --repeats 7 --seed 42
```

`bench` performs:

1. `bench:prepare` (builds `@xndrjs/domain`, `@xndrjs/domain-zod`, `@xndrjs/domain-valibot`, `@xndrjs/bench-perf`);
2. benchmark execution from `dist/index.js`.

### Fast local iteration from source

```bash
pnpm --filter @xndrjs/bench-perf bench:dev -- --scenario fe-medium-form --engine zod --mode valid --input-size 10000 --warmup 1000 --repeats 7 --seed 42
```

### Full engine comparison with report generation

```bash
pnpm --filter @xndrjs/bench-perf bench:matrix -- --scenario fe-medium-form --mode valid --input-size 10000 --warmup 1000 --repeats 7 --seed 42
```

Example (`migration-batch`, 100k records):

```bash
pnpm --filter @xndrjs/bench-perf bench:matrix -- --scenario migration-batch --mode valid --input-size 100000 --warmup 1000 --repeats 7 --seed 42
```

This executes all supported engines for the scenario and saves:

- one JSON result per engine;
- one markdown comparison report.

Default output directory format:

`results/<scenario>/<utc-timestamp>-<commit-hash>/<mode>-<input-size>/`

You can override it:

```bash
pnpm --filter @xndrjs/bench-perf bench:matrix -- --scenario fe-medium-form --mode valid --input-size 10000 --output-dir results/manual/fe-valid
```

### Utility: list scenarios

```bash
pnpm --filter @xndrjs/bench-perf bench -- --list-scenarios
```

## How to read results

- `opsPerSec`:
  - higher is better for throughput workloads.
- `msPerOp`:
  - lower is better for latency-sensitive paths.
- `heapDeltaBytes`:
  - useful for relative trends, but noisy in isolation.
- invalid-path runs:
  - often cost more due to issue construction/reporting.

Decision guideline:

- if difference is small in your critical scenario, prioritize maintainability and DX;
- if difference is large in hot path or high-volume migration, consider targeted fallback to `core` or `raw` in that specific path.

## Threats to validity

- semantic differences among libraries can bias comparisons;
- richer error payloads have intentional extra cost;
- hardware, Node version, and thermal conditions impact results;
- tiny synthetic benchmarks can overstate gains not visible in real workflows.

## Readiness checklist for baseline runs

- use `bench` or `bench:matrix` (not `bench:dev`);
- pin `seed`, `warmup`, `repeats`, and `input-size`;
- compare engines on identical scenario/mode settings;
- archive generated JSON + markdown reports from `results/`.
