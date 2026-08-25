import type { ResolutionStrategy } from "@xndrjs/resource-graph-resolver";

import type { BenchGraphCounts, GraphProfile } from "../graph/generate";
import type { ResolutionRunMetrics } from "../metrics/collect";
import type { RunsMetricsSummary } from "../metrics/summarize";

/** One matrix cell / single-run configuration. */
export type BenchCaseConfig = {
  readonly profile: GraphProfile;
  readonly depth: number;
  readonly arity: number;
  /** Page root fan-out; unused (`0`) for `tree`. */
  readonly modules: number;
  /** Early-product stride; unused (`0`) for `tree`. */
  readonly productStride: number;
  readonly strategy: ResolutionStrategy;
  readonly cmsBatchSize: number;
  readonly integrationBatchSize: number;
  readonly cmsLatencyMs: number;
  readonly integrationLatencyMs: number;
  /** Loads the CMS source tolerates in parallel (matrix baseline = 1). */
  readonly cmsConcurrency: number;
  /** Loads the integration source tolerates in parallel (matrix baseline = 1). */
  readonly integrationConcurrency: number;
  readonly maxNodes: number;
  readonly warmup: number;
  readonly repeats: number;
};

/** Dimensions that form the cartesian product for `--matrix` (before warmup/repeats). */
export type MatrixDimensions = {
  readonly profile: readonly GraphProfile[];
  readonly depth: readonly number[];
  readonly arity: readonly number[];
  readonly modules: readonly number[];
  readonly productStride: readonly number[];
  readonly strategy: readonly ResolutionStrategy[];
  readonly cmsBatchSize: readonly number[];
  readonly integrationBatchSize: readonly number[];
  readonly cmsLatencyMs: readonly number[];
  readonly integrationLatencyMs: readonly number[];
  readonly cmsConcurrency: readonly number[];
  readonly integrationConcurrency: readonly number[];
};

export type BenchCaseResult = {
  readonly config: BenchCaseConfig;
  readonly graph: BenchGraphCounts;
  readonly summary: RunsMetricsSummary;
  readonly repeats: readonly ResolutionRunMetrics[];
};

export type BenchRunMeta = {
  readonly timestamp: string;
  readonly matrix: boolean;
  readonly cellCount: number;
  readonly runtime: {
    readonly node: string;
    readonly platform: string;
    readonly arch: string;
  };
};

export type BenchRawOutput = {
  readonly meta: BenchRunMeta;
  readonly runs: readonly {
    readonly config: BenchCaseConfig;
    readonly graph: BenchGraphCounts;
    readonly repeatIndex: number;
    readonly metrics: ResolutionRunMetrics;
  }[];
};

export type BenchSummaryOutput = {
  readonly meta: BenchRunMeta;
  readonly cells: readonly {
    readonly config: BenchCaseConfig;
    readonly graph: BenchGraphCounts;
    readonly summary: RunsMetricsSummary;
  }[];
};

export type RunnerCliArgs = {
  readonly profile?: GraphProfile;
  readonly depth?: number;
  readonly arity?: number;
  readonly modules?: number;
  readonly productStride?: number;
  readonly strategy?: ResolutionStrategy;
  readonly cmsBatchSize?: number;
  readonly integrationBatchSize?: number;
  readonly cmsLatencyMs?: number;
  readonly integrationLatencyMs?: number;
  readonly cmsConcurrency?: number;
  readonly integrationConcurrency?: number;
  readonly warmup: number;
  readonly repeats: number;
  readonly maxNodes: number;
  readonly outputDir?: string;
  readonly matrix: boolean;
  readonly list: boolean;
  readonly help: boolean;
};
