import type { SchedulingMode } from "@xndrjs/resource-graph-resolver";

import { DEFAULT_MAX_NODES, type GraphProfile } from "../graph/generate";
import type { BenchCaseConfig, MatrixDimensions, RunnerCliArgs } from "./types";

/**
 * Default `--matrix` for the pagebuilder profile: page-sized graphs (~0.8–1.6k
 * total resources) with mixed-depth products. Concurrency stays at 1.
 */
export const DEFAULT_MATRIX_DIMENSIONS: MatrixDimensions = {
  profile: ["pagebuilder"],
  modules: [32, 48, 64],
  depth: [5],
  arity: [3],
  productStride: [3],
  schedulingMode: ["lane", "barrier"],
  cmsBatchSize: [50, 100, 200],
  integrationBatchSize: [100],
  cmsLatencyMs: [20],
  integrationLatencyMs: [80],
  cmsConcurrency: [1],
  integrationConcurrency: [1],
};

/** Defaults when `--profile tree` is selected for matrix (regular synthetic tree). */
export const TREE_MATRIX_DIMENSIONS: Omit<MatrixDimensions, "profile"> = {
  modules: [0],
  depth: [7],
  arity: [1, 2, 3],
  productStride: [0],
  schedulingMode: ["lane", "barrier"],
  cmsBatchSize: [50, 100, 200],
  integrationBatchSize: [100],
  cmsLatencyMs: [20],
  integrationLatencyMs: [80],
  cmsConcurrency: [1],
  integrationConcurrency: [1],
};

/** Defaults for a single-run (non-matrix) pagebuilder invocation — ~1.2k total. */
export const DEFAULT_SINGLE_RUN: Omit<BenchCaseConfig, "schedulingMode"> & {
  readonly schedulingMode: SchedulingMode;
} = {
  profile: "pagebuilder",
  modules: 48,
  depth: 5,
  arity: 3,
  productStride: 3,
  schedulingMode: "lane",
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

/** Defaults for a single-run regular tree (used when `--profile tree` without overrides). */
export const DEFAULT_TREE_SINGLE_RUN: Pick<
  BenchCaseConfig,
  "modules" | "depth" | "arity" | "productStride"
> = {
  modules: 0,
  depth: 7,
  arity: 3,
  productStride: 0,
};

function singletonOrDefault<T>(override: T | undefined, defaults: readonly T[]): readonly T[] {
  return override !== undefined ? [override] : defaults;
}

function matrixBaseForProfile(profile: GraphProfile): Omit<MatrixDimensions, "profile"> {
  if (profile === "tree") {
    return TREE_MATRIX_DIMENSIONS;
  }
  const { profile: _profile, ...rest } = DEFAULT_MATRIX_DIMENSIONS;
  return rest;
}

/**
 * Builds matrix dimensions from CLI overrides.
 * Passing a scalar flag (e.g. `--modules 48`) replaces that axis with a singleton.
 */
export function resolveMatrixDimensions(args: RunnerCliArgs): MatrixDimensions {
  const profile = args.profile ?? DEFAULT_MATRIX_DIMENSIONS.profile[0]!;
  const base = matrixBaseForProfile(profile);
  return {
    profile: [profile],
    modules: singletonOrDefault(args.modules, base.modules),
    depth: singletonOrDefault(args.depth, base.depth),
    arity: singletonOrDefault(args.arity, base.arity),
    productStride: singletonOrDefault(args.productStride, base.productStride),
    schedulingMode: singletonOrDefault(args.schedulingMode, base.schedulingMode),
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

  for (const profile of dimensions.profile) {
    for (const modules of dimensions.modules) {
      for (const depth of dimensions.depth) {
        for (const arity of dimensions.arity) {
          for (const productStride of dimensions.productStride) {
            for (const schedulingMode of dimensions.schedulingMode) {
              for (const cmsBatchSize of dimensions.cmsBatchSize) {
                for (const integrationBatchSize of dimensions.integrationBatchSize) {
                  for (const cmsLatencyMs of dimensions.cmsLatencyMs) {
                    for (const integrationLatencyMs of dimensions.integrationLatencyMs) {
                      for (const cmsConcurrency of dimensions.cmsConcurrency) {
                        for (const integrationConcurrency of dimensions.integrationConcurrency) {
                          cells.push({
                            profile,
                            modules,
                            depth,
                            arity,
                            productStride,
                            schedulingMode,
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
      }
    }
  }

  return cells;
}

/** One cell from CLI flags (non-matrix mode). */
export function singleRunConfig(args: RunnerCliArgs): BenchCaseConfig {
  const profile = args.profile ?? DEFAULT_SINGLE_RUN.profile;
  const treeDefaults = profile === "tree" ? DEFAULT_TREE_SINGLE_RUN : null;

  return {
    profile,
    modules: args.modules ?? treeDefaults?.modules ?? DEFAULT_SINGLE_RUN.modules,
    depth: args.depth ?? treeDefaults?.depth ?? DEFAULT_SINGLE_RUN.depth,
    arity: args.arity ?? treeDefaults?.arity ?? DEFAULT_SINGLE_RUN.arity,
    productStride:
      args.productStride ?? treeDefaults?.productStride ?? DEFAULT_SINGLE_RUN.productStride,
    schedulingMode: args.schedulingMode ?? DEFAULT_SINGLE_RUN.schedulingMode,
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
