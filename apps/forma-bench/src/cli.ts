import { benchmarkRuntime } from "./runtime/benchmark";
import { providerCountForShape } from "./runtime/graph";
import { runLoadTest } from "./runtime/load";
import { runStressSuite } from "./runtime/stress";
import type {
  GraphShape,
  LoadConfig,
  RuntimeBenchConfig,
  RuntimeScenario,
  StressConfig,
} from "./runtime/types";
import {
  printLoadResult,
  printRuntimeResults,
  printStressResults,
  writeLoadResult,
  writeRuntimeResults,
} from "./report";

const SCENARIOS: readonly RuntimeScenario[] = ["compose", "cold", "hot", "concurrent", "stream"];
const MATRIX_SHAPES: readonly GraphShape[] = [
  { arity: 2, depth: 4 },
  { arity: 2, depth: 5 },
  { arity: 3, depth: 4 },
];

type TimedRunPreset = LoadConfig & { readonly outputDir: string };

const LOAD_PRESET: TimedRunPreset = {
  shape: { arity: 2, depth: 5 },
  durationSeconds: 30,
  concurrency: 32,
  streamPercent: 20,
  streamItems: 8,
  sampleIntervalMs: 1000,
  outputDir: "results",
};

const SOAK_PRESET: TimedRunPreset = {
  shape: { arity: 3, depth: 4 },
  durationSeconds: 300,
  concurrency: 64,
  streamPercent: 20,
  streamItems: 8,
  sampleIntervalMs: 1000,
  outputDir: "results",
};

type CliOptions = {
  readonly scenarios: readonly RuntimeScenario[];
  readonly shapes: readonly GraphShape[];
  readonly iterations: number;
  readonly warmup: number;
  readonly repeats: number;
  readonly concurrency: number;
  readonly streamItems: number;
  readonly cycles: number;
  readonly openContexts: number;
  readonly durationSeconds: number;
  readonly streamPercent: number;
  readonly sampleIntervalMs: number;
  readonly stress: boolean;
  readonly load: boolean;
  readonly soak: boolean;
  readonly matrix: boolean;
  readonly outputDir?: string;
  readonly help: boolean;
};

const HELP = `forma-bench

Runtime benchmark:
  --scenario <compose|cold|hot|concurrent|stream|all>  Default: all
  --arity <n>                                            Default: 2
  --depth <n>                                            Default: 4
  --iterations <n>                                       Default: 100
  --warmup <n>                                           Default: 2
  --repeats <n>                                          Default: 7
  --concurrency <n>                                      Default: 32
  --stream-items <n>                                     Default: 8
  --matrix                                               Shapes a2/d4, a2/d5, a3/d4; all scenarios
  --output-dir <path>                                    Write JSON and Markdown

Stress suite:
  --stress
  --cycles <n>                                           Default: 500
  --open-contexts <n>                                    Default: 32

Closed-loop load / soak:
  --load                                                 Preset: a2/d5, 30 s, concurrency 32
  --soak                                                 Preset: a3/d4, 300 s, concurrency 64
  --duration-seconds <n>                                 Override duration
  --stream-percent <0..100>                              Override stream mix (preset: 20)
  --sample-ms <n>                                        Override sampling (preset: 1000)
  --concurrency <n>                                      Override concurrency
  --stream-items <n>                                     Override items per stream (preset: 8)
  --output-dir <path>                                    Override preset output directory
  --no-output                                            Do not persist preset results

Type-scale benchmark:
  pnpm --filter @xndrjs/forma-bench bench:types
`;

function parsePositive(value: string | undefined, fallback: number, flag: string): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

function parseNonNegative(value: string | undefined, fallback: number, flag: string): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative integer.`);
  }
  return parsed;
}

function parsePercentage(value: string | undefined, fallback: number, flag: string): number {
  const parsed = parseNonNegative(value, fallback, flag);
  if (parsed > 100) throw new Error(`${flag} must be between 0 and 100.`);
  return parsed;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const values = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      values.set(key, next);
      index += 1;
    } else {
      values.set(key, true);
    }
  }

  const matrix = values.has("matrix");
  const load = values.has("load");
  const soak = values.has("soak");
  const stress = values.has("stress");
  if ([load, soak, stress].filter(Boolean).length > 1) {
    throw new Error("Choose only one of --load, --soak, or --stress.");
  }
  if (matrix && (load || soak || stress)) {
    throw new Error("--matrix is supported only by the runtime benchmark.");
  }
  const timedRunPreset = soak ? SOAK_PRESET : load ? LOAD_PRESET : undefined;
  const scenarioValue = values.get("scenario");
  let scenarios: readonly RuntimeScenario[] = SCENARIOS;
  if (typeof scenarioValue === "string" && scenarioValue !== "all") {
    if (!SCENARIOS.includes(scenarioValue as RuntimeScenario)) {
      throw new Error(`Unknown scenario "${scenarioValue}".`);
    }
    scenarios = [scenarioValue as RuntimeScenario];
  }

  const outputValue = values.get("output-dir");
  const noOutput = values.has("no-output");
  if (noOutput && typeof outputValue === "string") {
    throw new Error("Choose only one of --output-dir or --no-output.");
  }
  return {
    scenarios,
    shapes: matrix
      ? MATRIX_SHAPES
      : [
          {
            arity: parsePositive(
              values.get("arity") as string | undefined,
              timedRunPreset?.shape.arity ?? 2,
              "--arity"
            ),
            depth: parsePositive(
              values.get("depth") as string | undefined,
              timedRunPreset?.shape.depth ?? 4,
              "--depth"
            ),
          },
        ],
    iterations: parsePositive(
      values.get("iterations") as string | undefined,
      matrix ? 50 : 100,
      "--iterations"
    ),
    warmup: parseNonNegative(values.get("warmup") as string | undefined, 2, "--warmup"),
    repeats: parsePositive(values.get("repeats") as string | undefined, 7, "--repeats"),
    concurrency: parsePositive(
      values.get("concurrency") as string | undefined,
      timedRunPreset?.concurrency ?? 32,
      "--concurrency"
    ),
    streamItems: parsePositive(
      values.get("stream-items") as string | undefined,
      timedRunPreset?.streamItems ?? 8,
      "--stream-items"
    ),
    cycles: parsePositive(values.get("cycles") as string | undefined, 500, "--cycles"),
    openContexts: parsePositive(
      values.get("open-contexts") as string | undefined,
      32,
      "--open-contexts"
    ),
    durationSeconds: parsePositive(
      values.get("duration-seconds") as string | undefined,
      timedRunPreset?.durationSeconds ?? 30,
      "--duration-seconds"
    ),
    streamPercent: parsePercentage(
      values.get("stream-percent") as string | undefined,
      timedRunPreset?.streamPercent ?? 20,
      "--stream-percent"
    ),
    sampleIntervalMs: parsePositive(
      values.get("sample-ms") as string | undefined,
      timedRunPreset?.sampleIntervalMs ?? 1000,
      "--sample-ms"
    ),
    stress,
    load,
    soak,
    matrix,
    ...(typeof outputValue === "string"
      ? { outputDir: outputValue }
      : timedRunPreset && !noOutput
        ? { outputDir: timedRunPreset.outputDir }
        : {}),
    help: values.has("help"),
  };
}

export async function runCli(argv: readonly string[]): Promise<void> {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(HELP);
    return;
  }

  console.log(`Forma bench on ${process.version} (${process.platform}/${process.arch})`);

  if (options.stress) {
    const config: StressConfig = {
      shape: options.shapes[0] ?? { arity: 2, depth: 4 },
      cycles: options.cycles,
      concurrency: options.concurrency,
      openContexts: options.openContexts,
    };
    const checks = await runStressSuite(config);
    printStressResults(checks);
    console.log("Stress suite passed: all lifecycle counters returned to zero.");
    return;
  }

  if (options.load || options.soak) {
    const config: LoadConfig = {
      shape: options.shapes[0] ?? { arity: 2, depth: 4 },
      durationSeconds: options.durationSeconds,
      concurrency: options.concurrency,
      streamPercent: options.streamPercent,
      streamItems: options.streamItems,
      sampleIntervalMs: options.sampleIntervalMs,
    };
    console.error(
      `[forma-bench] ${options.soak ? "soak" : "load"}, shape=a${config.shape.arity}/d${config.shape.depth}, providers=${providerCountForShape(config.shape)}, duration=${config.durationSeconds}s, concurrency=${config.concurrency}, streams=${config.streamPercent}%`
    );
    const result = await runLoadTest(config);
    printLoadResult(result);
    if (options.outputDir) {
      const outputDirectory = await writeLoadResult(options.outputDir, result);
      console.log(`Wrote soak/load results to ${outputDirectory}`);
    }
    console.log("Soak/load test passed: results, lifecycle, and cleanup remained correct.");
    return;
  }

  const results = [];
  for (const shape of options.shapes) {
    for (const scenario of options.scenarios) {
      const config: RuntimeBenchConfig = {
        scenario,
        shape,
        iterations: options.iterations,
        warmup: options.warmup,
        repeats: options.repeats,
        concurrency: options.concurrency,
        streamItems: options.streamItems,
      };
      console.error(
        `[forma-bench] ${scenario}, shape=a${shape.arity}/d${shape.depth}, providers=${providerCountForShape(shape)}, warmup=${config.warmup}, repeats=${config.repeats}`
      );
      results.push(await benchmarkRuntime(config));
    }
  }

  printRuntimeResults(results);
  if (options.outputDir) {
    const outputDirectory = await writeRuntimeResults(options.outputDir, results);
    console.log(`Wrote benchmark results to ${outputDirectory}`);
  }
}
