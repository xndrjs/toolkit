import { performance } from "node:perf_hooks";

import type { BenchmarkAdapter, BenchmarkEngine } from "../adapters";
import type { RepeatResult, RunnerDefinition, RunnerJsonOutput, SeededRng } from "./types";
import { summarize } from "./stats";

type RunnerScenario = RunnerDefinition["scenarios"][number];

function createSeededRng(seed: number): SeededRng {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(maxExclusive: number) {
      return Math.floor(this.next() * maxExclusive);
    },
  };
}

function runIteration(
  adapter: BenchmarkAdapter<unknown>,
  schema: unknown,
  inputs: readonly unknown[],
  repeatIndex: number
): RepeatResult {
  const validator = adapter.createValidator(schema);
  const heapBefore = process.memoryUsage().heapUsed;
  const start = performance.now();

  let successCount = 0;
  let failureCount = 0;

  for (const input of inputs) {
    const result = validator.validate(input);
    if (result.success) {
      successCount += 1;
    } else {
      failureCount += 1;
    }
  }

  const durationMs = performance.now() - start;
  const heapAfter = process.memoryUsage().heapUsed;

  return {
    repeatIndex,
    durationMs,
    operations: inputs.length,
    successCount,
    failureCount,
    heapDeltaBytes: heapAfter - heapBefore,
  };
}

function warmup(
  adapter: BenchmarkAdapter<unknown>,
  schema: unknown,
  inputs: readonly unknown[],
  warmupRuns: number
): void {
  if (warmupRuns <= 0 || inputs.length === 0) {
    return;
  }
  const validator = adapter.createValidator(schema);
  for (let index = 0; index < warmupRuns; index += 1) {
    const input = inputs[index % inputs.length];
    validator.validate(input);
  }
}

function mustGetAdapter(
  adapters: readonly BenchmarkAdapter<unknown>[],
  engine: BenchmarkEngine
): BenchmarkAdapter<unknown> {
  const adapter = adapters.find((candidate) => candidate.engine === engine);
  if (!adapter) {
    throw new Error(`Unknown engine "${engine}".`);
  }
  return adapter;
}

function mustGetScenario(
  scenarios: readonly RunnerScenario[],
  scenarioName: string
): RunnerScenario {
  const scenario = scenarios.find((candidate) => candidate.name === scenarioName);
  if (!scenario) {
    throw new Error(`Unknown scenario "${scenarioName}".`);
  }
  return scenario;
}

export function executeBenchmark(args: {
  definition: RunnerDefinition;
  scenarioName: string;
  engine: BenchmarkEngine;
  mode: "valid" | "invalid";
  inputSize: number;
  warmupRuns: number;
  repeats: number;
  seed: number;
}): RunnerJsonOutput {
  const scenario = mustGetScenario(args.definition.scenarios, args.scenarioName);
  if (!scenario.supportedEngines.includes(args.engine)) {
    throw new Error(
      `Scenario "${scenario.name}" does not support engine "${args.engine}". Supported: ${scenario.supportedEngines.join(", ")}.`
    );
  }

  const adapter = mustGetAdapter(args.definition.adapters, args.engine);
  const rng = createSeededRng(args.seed);
  const benchmarkCase = scenario.createCase({
    engine: args.engine,
    mode: args.mode,
    inputSize: args.inputSize,
    context: {
      seed: args.seed,
      rng,
    },
  });

  warmup(adapter, benchmarkCase.schema, benchmarkCase.inputs, args.warmupRuns);

  const repeats: RepeatResult[] = [];
  for (let repeat = 0; repeat < args.repeats; repeat += 1) {
    repeats.push(runIteration(adapter, benchmarkCase.schema, benchmarkCase.inputs, repeat + 1));
  }

  const opsPerSec = repeats.map((repeat) =>
    repeat.durationMs === 0 ? 0 : repeat.operations / (repeat.durationMs / 1000)
  );
  const msPerOp = repeats.map((repeat) =>
    repeat.operations === 0 ? 0 : repeat.durationMs / repeat.operations
  );
  const heapDeltas = repeats.map((repeat) => repeat.heapDeltaBytes);

  return {
    meta: {
      scenario: scenario.name,
      engine: args.engine,
      mode: args.mode,
      inputSize: args.inputSize,
      warmup: args.warmupRuns,
      repeats: args.repeats,
      seed: args.seed,
      timestamp: new Date().toISOString(),
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    },
    totals: {
      operations: repeats.reduce((acc, repeat) => acc + repeat.operations, 0),
      successCount: repeats.reduce((acc, repeat) => acc + repeat.successCount, 0),
      failureCount: repeats.reduce((acc, repeat) => acc + repeat.failureCount, 0),
    },
    summary: {
      opsPerSec: summarize(opsPerSec),
      msPerOp: summarize(msPerOp),
      heapDeltaBytes: summarize(heapDeltas),
    },
    repeats,
  };
}
