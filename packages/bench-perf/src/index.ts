import type { BenchmarkMode } from "./adapters";
import { coreAdapter, rawAdapter, valibotAdapter, zodAdapter } from "./adapters";
import { runCli, type RunnerDefinition } from "./runner";
import { runnerSmokeScenario } from "./scenarios";

export type { BenchmarkMode } from "./adapters";
export {
  type AdapterSemanticProfile,
  type BenchmarkAdapter,
  type BenchmarkEngine,
  type BenchmarkFailure,
  type BenchmarkIssue,
  type BenchmarkValidationResult,
  type BenchmarkValidator,
  type RawSchema,
} from "./adapters";
export { coreAdapter, rawAdapter, valibotAdapter, zodAdapter } from "./adapters";
export {
  executeBenchmark,
  parseRunnerArgs,
  runCli,
  type BenchmarkCase,
  type BenchmarkScenario,
  type RepeatResult,
  type RunnerCliArgs,
  type RunnerDefinition,
  type RunnerJsonOutput,
  type RunnerSummary,
  type SeededRng,
  type SummaryMetric,
} from "./runner";
export { runnerSmokeScenario } from "./scenarios";

export interface BenchEntrypointOptions {
  scenario: string;
  engine: "zod" | "valibot" | "core" | "raw";
  mode: BenchmarkMode;
  inputSize: number;
  warmup: number;
  repeats: number;
  seed: number;
}

const runnerDefinition: RunnerDefinition = {
  adapters: [zodAdapter, valibotAdapter, coreAdapter, rawAdapter],
  scenarios: [runnerSmokeScenario],
};

export function runBench(options: BenchEntrypointOptions) {
  return runCli(runnerDefinition, [
    "--scenario",
    options.scenario,
    "--engine",
    options.engine,
    "--mode",
    options.mode,
    "--input-size",
    String(options.inputSize),
    "--warmup",
    String(options.warmup),
    "--repeats",
    String(options.repeats),
    "--seed",
    String(options.seed),
  ]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(runnerDefinition, process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[bench-perf] ${message}`);
      process.exitCode = 1;
    });
}
