# @xndrjs/forma-bench

Private benchmark, stress, and soak/load application for the production-readiness limits of `@xndrjs/forma`. It uses Forma only through its public package entrypoint.

The app answers three separate questions:

1. how the TypeScript contract scales when the graph remains fully precise;
2. how composition, materialization, invocation, streaming, and disposal scale at runtime;
3. whether sustained mixed traffic preserves correctness, cleanup, latency, throughput, and memory stability.

It is a regression instrument, not a claim about universal absolute performance. Compare runs on the same machine, Node version, TypeScript version, and power profile.

## Type-scale fixtures

`type-fixtures/` contains generated, checked-in balanced trees with constant arity and a root-to-leaf depth of four or five edges. The current shapes are binary depth 4 (31 Providers), binary depth 5 (63 Providers), ternary depth 4 (121 Providers), and ternary depth 5 (364 Providers). Every parent depends on all children at the next level, every leaf is context-owned, and the graph keeps an exact inline `surface` and `wiring` tuple. This forces Contract analysis and transitive lifetime propagation across realistic fan-out rather than an artificial linear chain.

```bash
pnpm --filter @xndrjs/forma-bench bench:types
```

The command builds Forma, verifies that the generated fixtures are current, then compiles each fixture in an isolated TypeScript process with `skipLibCheck: false` and extended diagnostics. It reports pass/fail, wall time, TypeScript check/total time, type instantiations, and compiler memory.

The 31-, 63-, and 121-Provider fixtures are guards included in normal workspace typecheck. On TypeScript 5.9.3 the 364-Provider fixture also passes, but remains a capacity probe because its compiler cost is intentionally high; its failure is reported without making the benchmark command itself fail. When Forma's type-level ceiling improves, move newly passing probes into `GUARDED_TYPE_SCALE_SHAPES` and the app `tsconfig`.

If the generator changes:

```bash
pnpm --filter @xndrjs/forma-bench generate
```

Normal workspace typecheck verifies every generated fixture is current and compiles every guarded fixture.

## Runtime scenarios

Runtime graphs use the same balanced shapes as the type-scale fixtures. Every invocation traverses the full tree; the leaves are context-owned and that lifetime propagates to their ancestors. All Boundary, Intent, and Provider values are authentic. Casts are confined to the data-driven `using` records and `compose` call, where a runtime matrix cannot retain the statically named records and tuple precision that the public API intentionally requires. No Forma internals are imported.

| Scenario     | Measures                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------- |
| `compose`    | graph validation, plan construction, and root disposal without Provider materialization      |
| `cold`       | one invocation in a fresh context, including async materialization and full context disposal |
| `hot`        | repeated calls after one context has materialized the complete dependency chain              |
| `concurrent` | concurrent first use; verifies that every Provider factory materializes once per context     |
| `stream`     | cold stream start, multi-yield consumption, invocation cleanup, and context disposal         |

Fast source run:

```bash
pnpm --filter @xndrjs/forma-bench bench:dev -- --scenario all --arity 2 --depth 4 --iterations 100 --warmup 2 --repeats 7
```

Comparable run from built artifacts:

```bash
pnpm --filter @xndrjs/forma-bench bench -- --scenario all --arity 2 --depth 5 --iterations 100 --warmup 2 --repeats 7
```

Full shape matrix, with JSON and Markdown under `results/<timestamp>/`:

```bash
pnpm --filter @xndrjs/forma-bench bench:matrix
```

Relevant flags:

- `--scenario compose|cold|hot|concurrent|stream|all`;
- `--arity <children-per-parent>` and `--depth <root-to-leaf-edges>`;
- `--iterations`, `--warmup`, `--repeats`;
- `--concurrency` for the concurrent-first-use scenario;
- `--stream-items` for the stream scenario;
- `--matrix` for all scenarios at binary depth 4 (31 Providers), binary depth 5 (63), and ternary depth 4 (121);
- `--output-dir <path>` to persist machine-readable and Markdown results.

## Lifecycle stress suite

The stress mode is assertion-driven. It fails immediately on a wrong result, duplicate materialization, missing stream `finally`, or non-zero active Provider count after cleanup.

It exercises:

- repeated open/invoke/dispose context cycles;
- concurrent first materialization in one context;
- early consumer break from streams;
- concurrent root disposal as backstop for multiple open contexts with active streams.

```bash
pnpm --filter @xndrjs/forma-bench stress:dev -- --arity 2 --depth 5 --cycles 500 --concurrency 64 --open-contexts 32
```

Use `stress` instead of `stress:dev` to build Forma and run the compiled benchmark app.

## Closed-loop load and soak tests

Load and soak modes use the same assertion-driven runner, but answer different questions. A load test is relatively short and asks how the system behaves under a chosen level of pressure: throughput, latency, saturation, and correctness. A soak test keeps traffic running much longer and asks whether the system remains healthy over time: stable memory, no accumulated resources, no lifecycle drift, and no progressive degradation.

Both keep a fixed number of workers active for a wall-clock duration. Each worker starts its next request only after the previous one finishes. This is a closed-loop test: `--concurrency` is the maximum number of in-flight requests, not a target arrival rate.

Every request gets a fresh execution context and traverses the full Provider DAG. The default workload is 80% unary requests and 20% finite streams. A stream request consumes and validates every item before its context closes. The run fails on an incorrect result, a stream that does not close, a materialization/disposal imbalance, or a non-zero final active-Provider count.

The package scripts are complete presets, including result persistence. The load preset uses 63 Providers for 30 seconds at concurrency 32:

```bash
pnpm --filter @xndrjs/forma-bench load
```

The soak preset uses 121 Providers for 5 minutes at concurrency 64:

```bash
pnpm --filter @xndrjs/forma-bench soak
```

Both use an 80/20 unary/stream mix and write under `results/<timestamp>/`. Any explicit CLI flag overrides the corresponding preset value; `--no-output` disables persistence. Use `load:dev` or `soak:dev` to run the same presets from TypeScript sources. Both source and built scripts expose the garbage collector so the retained-heap delta can compare forced-GC measurements at the start and end.

Relevant flags:

- `--duration-seconds <n>` overrides the 30-second load or 300-second soak default;
- `--concurrency <n>` selects the number of closed-loop workers;
- `--stream-percent <0..100>` controls the request mix;
- `--stream-items <n>` controls the number of items in each finite stream;
- `--sample-ms <n>` controls time-series sampling;
- `--arity`, `--depth`, and `--output-dir` have the same meaning as in runtime mode.
- `--no-output` keeps the run console-only.

The console separates unary, stream, and overall latency. With `--output-dir`, `load.json` contains the complete samples and `load.md` a summary. Request latency includes context creation, lazy materialization, invocation or full stream consumption, and disposal. Percentiles use a bounded 50,000-item reservoir so a long soak does not grow the measurement harness without bound. Workers share a cooperative yield after roughly every 64 aggregate requests; without that, this deliberately I/O-free workload would remain on the microtask queue and starve both the sampler and event-loop-delay monitor. The retained-heap number still includes the bounded recorder and report samples, so treat it as a regression signal rather than a formal leak proof.

No fixed performance threshold is encoded. Passing means semantic and lifecycle invariants held for the whole run; throughput, latency, event-loop delay, and memory are measurements to compare on equivalent hosts.

## Reading results

- `median ns/op` and `median ops/s` are useful for comparisons between commits on the same host.
- `p95 ms` exposes unstable repeats but is not an invocation latency percentile; each repeat contains many operations.
- heap delta is a noisy trend signal, not a leak proof. Lifecycle counters and repeated stress checks are the deterministic leak guard.
- load throughput is completed requests per second; stream items are counted separately and are not treated as requests.
- mixed overall latency combines unary requests and full streams, so use the separate percentiles to understand either workload.
- compile-scale results are compiler-version-specific; archive the Node and TypeScript versions with comparisons.

Do not turn a single run into an optimization target. A regression is credible when it repeats under the same environment and has a corresponding change in graph size, instantiations, lifecycle work, or runtime behavior.
