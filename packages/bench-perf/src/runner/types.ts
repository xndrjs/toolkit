import type { BenchmarkAdapter, BenchmarkEngine, BenchmarkMode } from "../adapters";

export interface SeededRng {
  next(): number;
  int(maxExclusive: number): number;
}

export interface RunnerContext {
  readonly seed: number;
  readonly rng: SeededRng;
}

export interface BenchmarkCase {
  readonly schema: unknown;
  readonly inputs: readonly unknown[];
}

export interface BenchmarkScenario {
  readonly name: string;
  readonly description: string;
  readonly supportedEngines: readonly BenchmarkEngine[];
  createCase(args: {
    engine: BenchmarkEngine;
    mode: BenchmarkMode;
    inputSize: number;
    context: RunnerContext;
  }): BenchmarkCase;
}

export interface RunnerCliArgs {
  readonly scenario?: string;
  readonly engine?: BenchmarkEngine;
  readonly mode: BenchmarkMode;
  readonly inputSize: number;
  readonly warmup: number;
  readonly repeats: number;
  readonly seed: number;
  readonly output?: string;
  readonly help: boolean;
  readonly listScenarios: boolean;
}

export interface RepeatResult {
  readonly repeatIndex: number;
  readonly durationMs: number;
  readonly operations: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly heapDeltaBytes: number;
}

export interface SummaryMetric {
  readonly median: number;
  readonly p95: number;
  readonly p99: number;
  readonly variance: number;
}

export interface RunnerSummary {
  readonly opsPerSec: SummaryMetric;
  readonly msPerOp: SummaryMetric;
  readonly heapDeltaBytes: SummaryMetric;
}

export interface RunnerJsonOutput {
  readonly meta: {
    readonly scenario: string;
    readonly engine: BenchmarkEngine;
    readonly mode: BenchmarkMode;
    readonly inputSize: number;
    readonly warmup: number;
    readonly repeats: number;
    readonly seed: number;
    readonly timestamp: string;
    readonly runtime: {
      readonly node: string;
      readonly platform: string;
      readonly arch: string;
    };
  };
  readonly totals: {
    readonly operations: number;
    readonly successCount: number;
    readonly failureCount: number;
  };
  readonly summary: RunnerSummary;
  readonly repeats: readonly RepeatResult[];
}

export interface RunnerDefinition {
  readonly adapters: readonly BenchmarkAdapter<unknown>[];
  readonly scenarios: readonly BenchmarkScenario[];
}
