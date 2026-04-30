# @xndrjs/bench-perf

Benchmark package to compare validation engines in repeatable scenarios.

## TL;DR: Which command should I use?

- Use `bench` when you want a reproducible run with fresh builds for dependent packages.
- Use `bench:dev` when iterating quickly in local development and you want to skip the initial build.

## Difference Between `bench` and `bench:dev`

### `bench` (recommended for baselines and result comparison)

Command:

```bash
pnpm --filter @xndrjs/bench-perf bench -- --scenario fe-medium-form --engine zod --mode valid --input-size 10000 --warmup 1000 --repeats 7 --seed 42
```

What it does:

1. Runs `bench:prepare` (builds `@xndrjs/domain`, `@xndrjs/domain-zod`, `@xndrjs/domain-valibot`, and `@xndrjs/bench-perf`).
2. Runs `node dist/index.js` with the passed arguments.

Use it when:

- you want results that are comparable over time;
- you changed code in involved packages;
- you are saving outputs to share or compare.

### `bench:dev` (fast local iteration)

Command:

```bash
pnpm --filter @xndrjs/bench-perf bench:dev -- --scenario fe-medium-form --engine zod --mode valid --input-size 10000 --warmup 1000 --repeats 7 --seed 42
```

What it does:

- runs `tsx src/index.ts` directly, without the preparatory build step.

Use it when:

- you are refining scenario/runner logic;
- you need quick feedback;
- you do not need a release-like run.

## Base Copy/Paste Commands (common cases)

Options are set for the FE baseline case (`input-size 10000`, `warmup 1000`, `repeats 7`, `seed 42`).

### 1) Parse-only valid (`fe-medium-form`)

```bash
pnpm --filter @xndrjs/bench-perf bench -- --scenario fe-medium-form --engine zod --mode valid --input-size 10000 --warmup 1000 --repeats 7 --seed 42
```

### 2) Parse-only invalid (`fe-medium-form`)

```bash
pnpm --filter @xndrjs/bench-perf bench -- --scenario fe-medium-form --engine zod --mode invalid --input-size 10000 --warmup 1000 --repeats 7 --seed 42
```

### 3) Parse+transform valid (`fe-medium-form-transform`)

```bash
pnpm --filter @xndrjs/bench-perf bench -- --scenario fe-medium-form-transform --engine zod --mode valid --input-size 10000 --warmup 1000 --repeats 7 --seed 42
```

### 4) Parse+transform invalid (`fe-medium-form-transform`)

```bash
pnpm --filter @xndrjs/bench-perf bench -- --scenario fe-medium-form-transform --engine zod --mode invalid --input-size 10000 --warmup 1000 --repeats 7 --seed 42
```

## Quick Variations

### Change engine

Replace `--engine zod` with:

- `--engine valibot`
- `--engine core`
- `--engine raw`

### Fast execution in development

Take one of the commands above and replace:

- `... bench -- ...`

with:

- `... bench:dev -- ...`

## Utility

### List available scenarios

```bash
pnpm --filter @xndrjs/bench-perf bench -- --list-scenarios
```
