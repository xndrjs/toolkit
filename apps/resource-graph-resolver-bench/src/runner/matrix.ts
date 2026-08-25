import type { ResolutionStrategy } from "@xndrjs/resource-graph-resolver";

import { DEFAULT_MAX_NODES } from "../graph/generate";
import type { BenchCaseConfig, MatrixDimensions, RunnerCliArgs } from "./types";

/**
 * Default `--matrix` dimensions from the plan.
 * Concurrency stays at 1 (serial lane per source) for the baseline.
 */
export const DEFAULT_MATRIX_DIMENSIONS: MatrixDimensions = {
  depth: [10],
  arity: [1, 2, 3],
  strategy: ["lane", "barrier"],
  cmsBatchSize: [50, 100, 200],
  integrationBatchSize: [100],
  cmsLatencyMs: [20],
  integrationLatencyMs: [80],
  cmsConcurrency: [1],
  integrationConcurrency: [1],
};

/** Defaults for a single-run (non-matrix) invocation. */
export const DEFAULT_SINGLE_RUN: Omit<BenchCaseConfig, "strategy"> & {
  readonly strategy: ResolutionStrategy;
} = {
  depth: 10,
  arity: 2,
  strategy: "lane",
  cmsBatchSize: 100,
  integrationBatchSize: 100,
  cmsLatencyMs: 20,
  integrationLatencyMs: 80,
  cmsConcurrency: 1,
  integrationConcurrency: 1,
  maxNodes: DEFAULT_MAX_NODES,
  warmup: 1,
  repeats: 5,
};

function singletonOrDefault<T>(override: T | undefined, defaults: readonly T[]): readonly T[] {
  return override !== undefined ? [override] : defaults;
}

/**
 * Builds matrix dimensions from CLI overrides.
 * Passing a scalar flag (e.g. `--depth 6`) replaces that axis with a singleton.
 */
export function resolveMatrixDimensions(args: RunnerCliArgs): MatrixDimensions {
  const base = DEFAULT_MATRIX_DIMENSIONS;
  return {
    depth: singletonOrDefault(args.depth, base.depth),
    arity: singletonOrDefault(args.arity, base.arity),
    strategy: singletonOrDefault(args.strategy, base.strategy),
    cmsBatchSize: singletonOrDefault(args.cmsBatchSize, base.cmsBatchSize),
    integrationBatchSize: singletonOrDefault(args.integrationBatchSize, base.integrationBatchSize),
    cmsLatencyMs: singletonOrDefault(args.cmsLatencyMs, base.cmsLatencyMs),
    integrationLatencyMs: singletonOrDefault(args.integrationLatencyMs, base.integrationLatencyMs),
    cmsConcurrency: singletonOrDefault(args.cmsConcurrency, base.cmsConcurrency),
    integrationConcurrency: singletonOrDefault(
      args.integrationConcurrency,
      base.integrationConcurrency
    ),
  };
}

/** Cartesian product of matrix dimensions → concrete case configs. */
export function expandMatrix(
  dimensions: MatrixDimensions,
  shared: {
    readonly maxNodes: number;
    readonly warmup: number;
    readonly repeats: number;
  }
): BenchCaseConfig[] {
  const cells: BenchCaseConfig[] = [];

  for (const depth of dimensions.depth) {
    for (const arity of dimensions.arity) {
      for (const strategy of dimensions.strategy) {
        for (const cmsBatchSize of dimensions.cmsBatchSize) {
          for (const integrationBatchSize of dimensions.integrationBatchSize) {
            for (const cmsLatencyMs of dimensions.cmsLatencyMs) {
              for (const integrationLatencyMs of dimensions.integrationLatencyMs) {
                for (const cmsConcurrency of dimensions.cmsConcurrency) {
                  for (const integrationConcurrency of dimensions.integrationConcurrency) {
                    cells.push({
                      depth,
                      arity,
                      strategy,
                      cmsBatchSize,
                      integrationBatchSize,
                      cmsLatencyMs,
                      integrationLatencyMs,
                      cmsConcurrency,
                      integrationConcurrency,
                      maxNodes: shared.maxNodes,
                      warmup: shared.warmup,
                      repeats: shared.repeats,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return cells;
}

/** One cell from CLI flags (non-matrix mode). */
export function singleRunConfig(args: RunnerCliArgs): BenchCaseConfig {
  return {
    depth: args.depth ?? DEFAULT_SINGLE_RUN.depth,
    arity: args.arity ?? DEFAULT_SINGLE_RUN.arity,
    strategy: args.strategy ?? DEFAULT_SINGLE_RUN.strategy,
    cmsBatchSize: args.cmsBatchSize ?? DEFAULT_SINGLE_RUN.cmsBatchSize,
    integrationBatchSize: args.integrationBatchSize ?? DEFAULT_SINGLE_RUN.integrationBatchSize,
    cmsLatencyMs: args.cmsLatencyMs ?? DEFAULT_SINGLE_RUN.cmsLatencyMs,
    integrationLatencyMs: args.integrationLatencyMs ?? DEFAULT_SINGLE_RUN.integrationLatencyMs,
    cmsConcurrency: args.cmsConcurrency ?? DEFAULT_SINGLE_RUN.cmsConcurrency,
    integrationConcurrency:
      args.integrationConcurrency ?? DEFAULT_SINGLE_RUN.integrationConcurrency,
    maxNodes: args.maxNodes,
    warmup: args.warmup,
    repeats: args.repeats,
  };
}

/** Cases to execute for the current CLI invocation. */
export function casesFromArgs(args: RunnerCliArgs): BenchCaseConfig[] {
  const shared = {
    maxNodes: args.maxNodes,
    warmup: args.warmup,
    repeats: args.repeats,
  };

  if (args.matrix || args.list) {
    return expandMatrix(resolveMatrixDimensions(args), shared);
  }

  return [singleRunConfig(args)];
}
