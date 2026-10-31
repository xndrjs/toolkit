import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";

import {
  assertFullyDisposed,
  createStreamGraph,
  createUnaryGraph,
  expectedUnaryValue,
} from "./graph";
import { summarize } from "./stats";
import type { Distribution, LoadConfig, LoadResult, LoadSample } from "./types";

const LATENCY_RESERVOIR_SIZE = 50_000;
const EVENT_LOOP_YIELD_TARGET_REQUESTS = 64;

class LatencyRecorder {
  readonly #samples: number[] = [];
  #count = 0;
  #sum = 0;
  #min = Number.POSITIVE_INFINITY;
  #max = Number.NEGATIVE_INFINITY;

  record(value: number): void {
    this.#count += 1;
    this.#sum += value;
    this.#min = Math.min(this.#min, value);
    this.#max = Math.max(this.#max, value);

    if (this.#samples.length < LATENCY_RESERVOIR_SIZE) {
      this.#samples.push(value);
      return;
    }

    const replacement = Math.floor(Math.random() * this.#count);
    if (replacement < LATENCY_RESERVOIR_SIZE) {
      this.#samples[replacement] = value;
    }
  }

  summary(): Distribution {
    const sampled = summarize(this.#samples);
    if (this.#count === 0) return sampled;
    return {
      ...sampled,
      mean: this.#sum / this.#count,
      min: this.#min,
      max: this.#max,
    };
  }

  get sampleCount(): number {
    return this.#samples.length;
  }
}

function exposedGc(): (() => void) | undefined {
  return (globalThis as typeof globalThis & { gc?: () => void }).gc;
}

function activeProviders(
  unary: ReturnType<typeof createUnaryGraph>,
  stream: ReturnType<typeof createStreamGraph>
): number {
  return unary.counters.active + stream.counters.active;
}

export async function runLoadTest(config: LoadConfig): Promise<LoadResult> {
  if (config.streamPercent < 0 || config.streamPercent > 100) {
    throw new Error("streamPercent must be between 0 and 100.");
  }

  const unaryGraph = createUnaryGraph(config.shape);
  const streamGraph = createStreamGraph(config.shape, config.streamItems);
  const latency = new LatencyRecorder();
  const unaryLatency = new LatencyRecorder();
  const streamLatency = new LatencyRecorder();
  const samples: LoadSample[] = [];
  const loopDelay = monitorEventLoopDelay({ resolution: 20 });
  const gc = exposedGc();

  let sequence = 0;
  let completed = 0;
  let failed = 0;
  let unaryRequests = 0;
  let streamRequests = 0;
  let emittedStreamItems = 0;
  let unaryContexts = 0;
  let streamContexts = 0;
  let peakActiveProviders = 0;
  let peakHeapBytes = 0;
  let peakRssBytes = 0;
  let stopping = false;
  let firstFailure: unknown;
  let scheduledYield: Promise<void> | undefined;

  gc?.();
  const initialMemory = process.memoryUsage();
  peakHeapBytes = initialMemory.heapUsed;
  peakRssBytes = initialMemory.rss;

  const startedAt = performance.now();
  const deadline = startedAt + config.durationSeconds * 1000;
  let lastSampleAt = startedAt;
  let lastCompleted = 0;

  const recordActivePeak = (): number => {
    const current = activeProviders(unaryGraph, streamGraph);
    peakActiveProviders = Math.max(peakActiveProviders, current);
    return current;
  };

  const captureSample = (): void => {
    const now = performance.now();
    const memory = process.memoryUsage();
    const intervalMs = Math.max(now - lastSampleAt, Number.EPSILON);
    const sample: LoadSample = {
      elapsedMs: now - startedAt,
      intervalMs,
      completed,
      operationsPerSecond: ((completed - lastCompleted) * 1000) / intervalMs,
      heapUsedBytes: memory.heapUsed,
      rssBytes: memory.rss,
      activeProviders: recordActivePeak(),
    };
    samples.push(sample);
    peakHeapBytes = Math.max(peakHeapBytes, memory.heapUsed);
    peakRssBytes = Math.max(peakRssBytes, memory.rss);
    lastSampleAt = now;
    lastCompleted = completed;
  };

  const cooperativeYield = (): Promise<void> => {
    scheduledYield ??= yieldToEventLoop().finally(() => {
      scheduledYield = undefined;
    });
    return scheduledYield;
  };

  const yieldEvery = Math.max(1, Math.ceil(EVENT_LOOP_YIELD_TARGET_REQUESTS / config.concurrency));

  const sampleTimer = setInterval(captureSample, config.sampleIntervalMs);
  sampleTimer.unref();
  loopDelay.enable();

  const runUnary = async (input: number): Promise<void> => {
    unaryContexts += 1;
    await unaryGraph.root.withExecutionContext(async (surface) => {
      const result = await surface.run(input);
      if (!result.ok || result.value !== expectedUnaryValue(config.shape, input)) {
        throw new Error("Load-test unary request returned an unexpected result.");
      }
      recordActivePeak();
    });
    unaryRequests += 1;
  };

  const runStream = async (input: number): Promise<void> => {
    streamContexts += 1;
    await streamGraph.root.withExecutionContext(async (surface) => {
      let itemCount = 0;
      for await (const result of surface.run(input)) {
        if (!result.ok || result.value !== expectedUnaryValue(config.shape, input + itemCount)) {
          throw new Error("Load-test stream returned an unexpected result.");
        }
        itemCount += 1;
      }
      if (itemCount !== config.streamItems) {
        throw new Error(
          `Load-test stream emitted ${itemCount} items; expected ${config.streamItems}.`
        );
      }
      emittedStreamItems += itemCount;
      recordActivePeak();
    });
    streamRequests += 1;
  };

  const runWorker = async (): Promise<void> => {
    let requestsSinceYield = 0;
    while (!stopping && performance.now() < deadline) {
      const requestId = sequence;
      sequence += 1;
      const isStream = requestId % 100 < config.streamPercent;
      const requestStartedAt = performance.now();
      try {
        if (isStream) {
          await runStream(requestId);
        } else {
          await runUnary(requestId);
        }
        const durationMs = performance.now() - requestStartedAt;
        latency.record(durationMs);
        if (isStream) streamLatency.record(durationMs);
        else unaryLatency.record(durationMs);
        completed += 1;
        requestsSinceYield += 1;
        if (requestsSinceYield === yieldEvery) {
          requestsSinceYield = 0;
          await cooperativeYield();
        }
      } catch (error) {
        failed += 1;
        firstFailure ??= error;
        stopping = true;
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: config.concurrency }, () => runWorker()));
  } finally {
    stopping = true;
    clearInterval(sampleTimer);
    captureSample();
    loopDelay.disable();
  }

  const durationMs = performance.now() - startedAt;

  try {
    if (firstFailure !== undefined) throw firstFailure;
    assertFullyDisposed(unaryGraph, unaryContexts);
    assertFullyDisposed(streamGraph, streamContexts);
    if (streamGraph.counters.streamsClosed !== streamContexts) {
      throw new Error(
        `Expected ${streamContexts} closed streams; received ${streamGraph.counters.streamsClosed}.`
      );
    }
  } finally {
    await Promise.all([unaryGraph.root.dispose(), streamGraph.root.dispose()]);
  }

  gc?.();
  const finalMemory = process.memoryUsage();
  peakHeapBytes = Math.max(peakHeapBytes, finalMemory.heapUsed);
  peakRssBytes = Math.max(peakRssBytes, finalMemory.rss);
  const finalActiveProviders = activeProviders(unaryGraph, streamGraph);
  if (finalActiveProviders !== 0) {
    throw new Error(`Load test ended with ${finalActiveProviders} active Providers.`);
  }

  const throughputValues = samples
    .filter((sample) => sample.intervalMs >= config.sampleIntervalMs / 2)
    .map((sample) => sample.operationsPerSecond)
    .filter((value) => Number.isFinite(value) && value >= 0);
  const operationsPerSecond = completed / (durationMs / 1000);
  if (throughputValues.length === 0) throughputValues.push(operationsPerSecond);

  const milliseconds = (nanoseconds: number): number =>
    Number.isFinite(nanoseconds) ? nanoseconds / 1_000_000 : 0;

  return {
    config,
    durationMs,
    completed,
    unaryRequests,
    streamRequests,
    streamItems: emittedStreamItems,
    failed,
    operationsPerSecond,
    latencyMs: latency.summary(),
    unaryLatencyMs: unaryLatency.summary(),
    streamLatencyMs: streamLatency.summary(),
    sampledLatencies: latency.sampleCount,
    throughputSamples: summarize(throughputValues),
    eventLoopDelayMs: {
      mean: milliseconds(loopDelay.mean),
      p95: milliseconds(loopDelay.percentile(95)),
      p99: milliseconds(loopDelay.percentile(99)),
      max: milliseconds(loopDelay.max),
    },
    memory: {
      gcExposed: gc !== undefined,
      heapStartBytes: initialMemory.heapUsed,
      heapEndBytes: finalMemory.heapUsed,
      retainedHeapDeltaBytes: finalMemory.heapUsed - initialMemory.heapUsed,
      peakHeapBytes,
      peakRssBytes,
    },
    lifecycle: {
      unaryContexts,
      streamContexts,
      peakActiveProviders,
      finalActiveProviders,
    },
    samples,
  };
}
