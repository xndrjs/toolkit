import { performance } from "node:perf_hooks";

import {
  assertFullyDisposed,
  createStreamGraph,
  createUnaryGraph,
  createUnaryGraphDefinition,
  expectedUnaryValue,
} from "./graph";
import { summarize } from "./stats";
import type {
  RuntimeBenchConfig,
  RuntimeBenchResult,
  RuntimeRepeat,
  RuntimeScenario,
} from "./types";

function assertValue(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new Error(`Unexpected operation result: expected ${expected}, received ${actual}.`);
  }
}

type ScenarioMeasurement = {
  readonly durationMs: number;
  readonly operations: number;
};

async function runCompose(config: RuntimeBenchConfig): Promise<ScenarioMeasurement> {
  const definition = createUnaryGraphDefinition(config.shape);
  const startedAt = performance.now();
  for (let index = 0; index < config.iterations; index += 1) {
    const graph = definition.compose();
    await graph.root.dispose();
  }
  const durationMs = performance.now() - startedAt;
  if (definition.counters.created !== 0) {
    throw new Error("compose materialized a lazy Provider.");
  }
  return { durationMs, operations: config.iterations };
}

async function runCold(config: RuntimeBenchConfig): Promise<ScenarioMeasurement> {
  const graph = createUnaryGraph(config.shape);
  const startedAt = performance.now();
  try {
    for (let index = 0; index < config.iterations; index += 1) {
      await graph.root.withExecutionContext(async (surface) => {
        const result = await surface.run(index);
        if (!result.ok) throw new Error("Unexpected Err in cold benchmark.");
        assertValue(result.value, expectedUnaryValue(config.shape, index));
      });
    }
    assertFullyDisposed(graph, config.iterations);
    return { durationMs: performance.now() - startedAt, operations: config.iterations };
  } finally {
    await graph.root.dispose();
  }
}

async function runHot(config: RuntimeBenchConfig): Promise<ScenarioMeasurement> {
  const graph = createUnaryGraph(config.shape);
  const context = graph.root.openExecutionContext();
  try {
    const materialized = await context.surface.run(0);
    if (!materialized.ok) throw new Error("Unexpected Err while materializing hot graph.");

    const startedAt = performance.now();
    for (let index = 0; index < config.iterations; index += 1) {
      const result = await context.surface.run(index);
      if (!result.ok) throw new Error("Unexpected Err in hot benchmark.");
      assertValue(result.value, expectedUnaryValue(config.shape, index));
    }
    return { durationMs: performance.now() - startedAt, operations: config.iterations };
  } finally {
    await context.dispose();
    assertFullyDisposed(graph, 1);
    await graph.root.dispose();
  }
}

async function runConcurrent(config: RuntimeBenchConfig): Promise<ScenarioMeasurement> {
  const graph = createUnaryGraph(config.shape);
  const startedAt = performance.now();
  try {
    for (let iteration = 0; iteration < config.iterations; iteration += 1) {
      await graph.root.withExecutionContext(async (surface) => {
        const results = await Promise.all(
          Array.from({ length: config.concurrency }, (_, index) => surface.run(index))
        );
        for (let index = 0; index < results.length; index += 1) {
          const result = results[index];
          if (!result?.ok) throw new Error("Unexpected Err in concurrent benchmark.");
          assertValue(result.value, expectedUnaryValue(config.shape, index));
        }
      });
    }
    assertFullyDisposed(graph, config.iterations);
    return {
      durationMs: performance.now() - startedAt,
      operations: config.iterations * config.concurrency,
    };
  } finally {
    await graph.root.dispose();
  }
}

async function runStream(config: RuntimeBenchConfig): Promise<ScenarioMeasurement> {
  const graph = createStreamGraph(config.shape, config.streamItems);
  const startedAt = performance.now();
  try {
    for (let iteration = 0; iteration < config.iterations; iteration += 1) {
      await graph.root.withExecutionContext(async (surface) => {
        let itemCount = 0;
        for await (const result of surface.run(iteration)) {
          if (!result.ok) throw new Error("Unexpected Err in stream benchmark.");
          assertValue(result.value, expectedUnaryValue(config.shape, iteration + itemCount));
          itemCount += 1;
        }
        if (itemCount !== config.streamItems) {
          throw new Error(`Expected ${config.streamItems} stream items; received ${itemCount}.`);
        }
      });
    }
    assertFullyDisposed(graph, config.iterations);
    if (graph.counters.streamsClosed !== config.iterations) {
      throw new Error("Not every benchmark stream reached its finally block.");
    }
    return {
      durationMs: performance.now() - startedAt,
      operations: config.iterations * config.streamItems,
    };
  } finally {
    await graph.root.dispose();
  }
}

async function executeScenario(config: RuntimeBenchConfig): Promise<ScenarioMeasurement> {
  const runners: Record<
    RuntimeScenario,
    (value: RuntimeBenchConfig) => Promise<ScenarioMeasurement>
  > = {
    compose: runCompose,
    cold: runCold,
    hot: runHot,
    concurrent: runConcurrent,
    stream: runStream,
  };
  return runners[config.scenario](config);
}

export async function benchmarkRuntime(config: RuntimeBenchConfig): Promise<RuntimeBenchResult> {
  for (let index = 0; index < config.warmup; index += 1) {
    await executeScenario(config);
  }

  const repeats: RuntimeRepeat[] = [];
  for (let repeat = 1; repeat <= config.repeats; repeat += 1) {
    const heapBefore = process.memoryUsage().heapUsed;
    const { operations, durationMs } = await executeScenario(config);
    repeats.push({
      repeat,
      durationMs,
      operations,
      heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
    });
  }

  const nsPerOperation = repeats.map((repeat) =>
    repeat.operations === 0 ? 0 : (repeat.durationMs * 1_000_000) / repeat.operations
  );
  const operationsPerSecond = repeats.map((repeat) =>
    repeat.durationMs === 0 ? 0 : repeat.operations / (repeat.durationMs / 1000)
  );

  return {
    config,
    repeats,
    summary: {
      durationMs: summarize(repeats.map((repeat) => repeat.durationMs)),
      nsPerOperation: summarize(nsPerOperation),
      operationsPerSecond: summarize(operationsPerSecond),
      heapDeltaBytes: summarize(repeats.map((repeat) => repeat.heapDeltaBytes)),
    },
  };
}
