import type { BenchmarkMode } from "./adapters";

export type { BenchmarkMode } from "./adapters";
export {
  coreAdapter,
  rawAdapter,
  valibotAdapter,
  zodAdapter,
  type AdapterSemanticProfile,
  type BenchmarkAdapter,
  type BenchmarkEngine,
  type BenchmarkFailure,
  type BenchmarkIssue,
  type BenchmarkValidationResult,
  type BenchmarkValidator,
  type RawSchema,
} from "./adapters";

export interface BenchEntrypointOptions {
  scenario: string;
  engine: string;
  mode: BenchmarkMode;
}

/**
 * Temporary scaffold entrypoint for bench-perf package.
 */
export function runBench(options: BenchEntrypointOptions): BenchEntrypointOptions {
  return options;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("[bench-perf] scaffold ready");
}
