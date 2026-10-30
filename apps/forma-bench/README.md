# @xndrjs/forma-bench

Private benchmark and stress application for the production-readiness limits of `@xndrjs/forma`. It uses Forma only through its public package entrypoint.

The app answers two separate questions:

1. how the TypeScript contract scales when the graph remains fully precise;
2. how composition, materialization, invocation, streaming, and disposal scale at runtime.

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

## Reading results

- `median ns/op` and `median ops/s` are useful for comparisons between commits on the same host.
- `p95 ms` exposes unstable repeats but is not an invocation latency percentile; each repeat contains many operations.
- heap delta is a noisy trend signal, not a leak proof. Lifecycle counters and repeated stress checks are the deterministic leak guard.
- compile-scale results are compiler-version-specific; archive the Node and TypeScript versions with comparisons.

Do not turn a single run into an optimization target. A regression is credible when it repeats under the same environment and has a corresponding change in graph size, instantiations, lifecycle work, or runtime behavior.
