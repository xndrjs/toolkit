import type { Result, StreamSurfaceIterable } from "@xndrjs/forma";

export type RuntimeScenario = "compose" | "cold" | "hot" | "concurrent" | "stream";

export type GraphShape = {
  readonly arity: number;
  readonly depth: number;
};

export type ProviderCounters = {
  created: number;
  disposed: number;
  active: number;
  calls: number;
  streamsClosed: number;
};

export type UnarySurface = {
  readonly run: (input: number) => Promise<Result<number, never>>;
};

export type StreamSurface = {
  readonly run: (input: number) => StreamSurfaceIterable<number, never>;
};

export type DynamicExecutionContext<Surface> = {
  readonly surface: Surface;
  dispose(): Promise<void>;
};

export type DynamicCompositionRoot<Surface> = {
  describePlan(): {
    readonly providers: readonly unknown[];
    readonly surface: readonly unknown[];
  };
  openExecutionContext(): DynamicExecutionContext<Surface>;
  withExecutionContext<T>(run: (surface: Surface) => T | PromiseLike<T>): Promise<Awaited<T>>;
  dispose(): Promise<void>;
};

export type RuntimeGraph<Surface> = {
  readonly root: DynamicCompositionRoot<Surface>;
  readonly counters: ProviderCounters;
  readonly providerCount: number;
};

export type Distribution = {
  readonly median: number;
  readonly p95: number;
  readonly p99: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
};

export type RuntimeBenchConfig = {
  readonly scenario: RuntimeScenario;
  readonly shape: GraphShape;
  readonly iterations: number;
  readonly warmup: number;
  readonly repeats: number;
  readonly concurrency: number;
  readonly streamItems: number;
};

export type RuntimeRepeat = {
  readonly repeat: number;
  readonly durationMs: number;
  readonly operations: number;
  readonly heapDeltaBytes: number;
};

export type RuntimeBenchResult = {
  readonly config: RuntimeBenchConfig;
  readonly repeats: readonly RuntimeRepeat[];
  readonly summary: {
    readonly durationMs: Distribution;
    readonly nsPerOperation: Distribution;
    readonly operationsPerSecond: Distribution;
    readonly heapDeltaBytes: Distribution;
  };
};

export type StressConfig = {
  readonly shape: GraphShape;
  readonly cycles: number;
  readonly concurrency: number;
  readonly openContexts: number;
};

export type StressCheck = {
  readonly name: string;
  readonly durationMs: number;
  readonly operations: number;
};
