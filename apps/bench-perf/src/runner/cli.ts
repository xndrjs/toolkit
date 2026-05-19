import { join } from "node:path";

import type { BenchmarkEngine, BenchmarkMode } from "../adapters";
import type { RunnerCliArgs, RunnerDefinition } from "./types";
import { executeBenchmark } from "./execute";
import {
  defaultResultDir,
  renderComparisonMarkdown,
  sortByEngine,
  writeJsonOutput,
  writeMarkdownReport,
} from "./report";

const HELP_TEXT = `Usage:
  pnpm --filter @xndrjs/bench-perf bench -- --scenario <name> --engine <engine> [options]

Options:
  --scenario <name>       Scenario name
  --engine <engine>       zod | valibot | ajv | core | raw
  --mode <mode>           valid | invalid (default: valid)
  --input-size <number>   Number of input records (default: 1000)
  --warmup <number>       Warmup iterations (default: 500)
  --repeats <number>      Measured runs (default: 5)
  --seed <number>         Deterministic seed (default: 42)
  --output <path>         Save JSON output to path
  --output-dir <path>     Save JSON + markdown outputs into directory
  --matrix                Run all engines and write comparative report
  --list-scenarios        Print available scenarios
  --help                  Show this help
`;

function parseIntegerFlag(value: string | undefined, fallback: number, flagName: string): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for "${flagName}": "${value}".`);
  }
  return parsed;
}

function ensureEnum<T extends string>(
  value: string | undefined,
  accepted: readonly T[],
  label: string
): T | undefined {
  if (!value) {
    return undefined;
  }
  if (!accepted.includes(value as T)) {
    throw new Error(`Invalid ${label} "${value}". Allowed values: ${accepted.join(", ")}.`);
  }
  return value as T;
}

export function parseRunnerArgs(argv: readonly string[]): RunnerCliArgs {
  const map = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      map.set(key, next);
      index += 1;
    } else {
      map.set(key, true);
    }
  }

  const scenarioValue = map.get("scenario");
  const outputValue = map.get("output");
  const outputDirValue = map.get("output-dir");
  const parsedEngine = ensureEnum(
    map.get("engine") as string | undefined,
    ["zod", "valibot", "ajv", "core", "raw"],
    "engine"
  ) as BenchmarkEngine | undefined;
  return {
    ...(typeof scenarioValue === "string" ? { scenario: scenarioValue } : {}),
    ...(parsedEngine ? { engine: parsedEngine } : {}),
    ...(typeof outputValue === "string" ? { output: outputValue } : {}),
    ...(typeof outputDirValue === "string" ? { outputDir: outputDirValue } : {}),
    inputSize: parseIntegerFlag(map.get("input-size") as string | undefined, 1000, "--input-size"),
    warmup: parseIntegerFlag(map.get("warmup") as string | undefined, 500, "--warmup"),
    repeats: parseIntegerFlag(map.get("repeats") as string | undefined, 5, "--repeats"),
    seed: parseIntegerFlag(map.get("seed") as string | undefined, 42, "--seed"),
    mode: (ensureEnum(map.get("mode") as string | undefined, ["valid", "invalid"], "mode") ??
      "valid") as BenchmarkMode,
    matrix: map.has("matrix"),
    help: map.has("help"),
    listScenarios: map.has("list-scenarios"),
  };
}

function printScenarioList(definition: RunnerDefinition): void {
  if (definition.scenarios.length === 0) {
    console.log("No scenarios registered.");
    return;
  }
  for (const scenario of definition.scenarios) {
    console.log(
      `${scenario.name} (${scenario.supportedEngines.join(", ")}): ${scenario.description}`
    );
  }
}

function assertRunnable(args: RunnerCliArgs): asserts args is RunnerCliArgs & { scenario: string } {
  if (!args.scenario) {
    throw new Error(`Missing required "--scenario".`);
  }
  if (!args.matrix && !args.engine) {
    throw new Error(`Missing required "--engine".`);
  }
  if (args.inputSize <= 0) {
    throw new Error(`"--input-size" must be > 0.`);
  }
  if (args.warmup < 0) {
    throw new Error(`"--warmup" must be >= 0.`);
  }
  if (args.repeats <= 0) {
    throw new Error(`"--repeats" must be > 0.`);
  }
}

export async function runCli(
  definition: RunnerDefinition,
  argv: readonly string[]
): Promise<number> {
  try {
    const args = parseRunnerArgs(argv);
    if (args.help) {
      console.log(HELP_TEXT);
      return 0;
    }
    if (args.listScenarios) {
      printScenarioList(definition);
      return 0;
    }

    assertRunnable(args);
    const outputDir =
      args.outputDir ??
      (args.matrix
        ? defaultResultDir({
            scenario: args.scenario,
            mode: args.mode,
            inputSize: args.inputSize,
          })
        : undefined);

    if (args.matrix) {
      const scenario = definition.scenarios.find((entry) => entry.name === args.scenario);
      if (!scenario) {
        throw new Error(`Unknown scenario "${args.scenario}".`);
      }
      const outputs = scenario.supportedEngines.map((engine) =>
        executeBenchmark({
          definition,
          scenarioName: args.scenario,
          engine,
          mode: args.mode,
          inputSize: args.inputSize,
          warmupRuns: args.warmup,
          repeats: args.repeats,
          seed: args.seed,
        })
      );
      const sorted = sortByEngine(outputs);
      console.log(JSON.stringify(sorted, null, 2));

      if (outputDir) {
        for (const output of sorted) {
          await writeJsonOutput(join(outputDir, `${output.meta.engine}.json`), output);
        }
        await writeMarkdownReport(
          join(outputDir, "comparison.md"),
          renderComparisonMarkdown(sorted)
        );
      }
      return 0;
    }

    const result = executeBenchmark({
      definition,
      scenarioName: args.scenario,
      engine: args.engine as BenchmarkEngine,
      mode: args.mode,
      inputSize: args.inputSize,
      warmupRuns: args.warmup,
      repeats: args.repeats,
      seed: args.seed,
    });
    console.log(JSON.stringify(result, null, 2));
    if (args.output) {
      await writeJsonOutput(args.output, result);
    } else if (outputDir) {
      await writeJsonOutput(join(outputDir, `${result.meta.engine}.json`), result);
      await writeMarkdownReport(
        join(outputDir, "comparison.md"),
        renderComparisonMarkdown([result])
      );
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[bench-perf] ${message}`);
    console.error(HELP_TEXT);
    return 1;
  }
}
