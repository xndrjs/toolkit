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

export type LoadConfig = {
  readonly shape: GraphShape;
  readonly durationSeconds: number;
  readonly concurrency: number;
  readonly streamPercent: number;
  readonly streamItems: number;
  readonly sampleIntervalMs: number;
};

export type LoadSample = {
  readonly elapsedMs: number;
  readonly intervalMs: number;
  readonly completed: number;
  readonly operationsPerSecond: number;
  readonly heapUsedBytes: number;
  readonly rssBytes: number;
  readonly activeProviders: number;
};

export type LoadResult = {
  readonly config: LoadConfig;
  readonly durationMs: number;
  readonly completed: number;
  readonly unaryRequests: number;
  readonly streamRequests: number;
  readonly streamItems: number;
  readonly failed: number;
  readonly operationsPerSecond: number;
  readonly latencyMs: Distribution;
  readonly unaryLatencyMs: Distribution;
  readonly streamLatencyMs: Distribution;
  readonly sampledLatencies: number;
  readonly throughputSamples: Distribution;
  readonly eventLoopDelayMs: {
    readonly mean: number;
    readonly p95: number;
    readonly p99: number;
    readonly max: number;
  };
  readonly memory: {
    readonly gcExposed: boolean;
    readonly heapStartBytes: number;
    readonly heapEndBytes: number;
    readonly retainedHeapDeltaBytes: number;
    readonly peakHeapBytes: number;
    readonly peakRssBytes: number;
  };
  readonly lifecycle: {
    readonly unaryContexts: number;
    readonly streamContexts: number;
    readonly peakActiveProviders: number;
    readonly finalActiveProviders: number;
  };
  readonly samples: readonly LoadSample[];
};
