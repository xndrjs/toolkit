import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { LoadResult, RuntimeBenchResult, StressCheck } from "./runtime/types";
import { providerCountForShape } from "./runtime/graph";

function formatNumber(value: number, fractionDigits = 2): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: fractionDigits });
}

export function printRuntimeResults(results: readonly RuntimeBenchResult[]): void {
  console.table(
    results.map((result) => ({
      scenario: result.config.scenario,
      arity: result.config.shape.arity,
      depth: result.config.shape.depth,
      providers: providerCountForShape(result.config.shape),
      iterations: result.config.iterations,
      "median ms": formatNumber(result.summary.durationMs.median),
      "p95 ms": formatNumber(result.summary.durationMs.p95),
      "median ns/op": formatNumber(result.summary.nsPerOperation.median, 0),
      "median ops/s": formatNumber(result.summary.operationsPerSecond.median, 0),
      "heap median KB": formatNumber(result.summary.heapDeltaBytes.median / 1024, 0),
    }))
  );
}

export function printStressResults(checks: readonly StressCheck[]): void {
  console.table(
    checks.map((check) => ({
      check: check.name,
      operations: check.operations,
      "duration ms": formatNumber(check.durationMs),
    }))
  );
}

export function printLoadResult(result: LoadResult): void {
  console.table([
    {
      providers: providerCountForShape(result.config.shape),
      concurrency: result.config.concurrency,
      "stream %": result.config.streamPercent,
      "duration s": formatNumber(result.durationMs / 1000),
      completed: result.completed,
      failed: result.failed,
      "ops/s": formatNumber(result.operationsPerSecond, 0),
      "sample ops/s p50": formatNumber(result.throughputSamples.median, 0),
      "sample ops/s p95": formatNumber(result.throughputSamples.p95, 0),
      "latency p50 ms": formatNumber(result.latencyMs.median, 3),
      "latency p95 ms": formatNumber(result.latencyMs.p95, 3),
      "latency p99 ms": formatNumber(result.latencyMs.p99, 3),
    },
  ]);
  console.table([
    {
      workload: "all",
      requests: result.completed,
      "p50 ms": formatNumber(result.latencyMs.median, 3),
      "p95 ms": formatNumber(result.latencyMs.p95, 3),
      "p99 ms": formatNumber(result.latencyMs.p99, 3),
      "max ms": formatNumber(result.latencyMs.max, 3),
    },
    {
      workload: "unary",
      requests: result.unaryRequests,
      "p50 ms": formatNumber(result.unaryLatencyMs.median, 3),
      "p95 ms": formatNumber(result.unaryLatencyMs.p95, 3),
      "p99 ms": formatNumber(result.unaryLatencyMs.p99, 3),
      "max ms": formatNumber(result.unaryLatencyMs.max, 3),
    },
    {
      workload: "stream",
      requests: result.streamRequests,
      "p50 ms": formatNumber(result.streamLatencyMs.median, 3),
      "p95 ms": formatNumber(result.streamLatencyMs.p95, 3),
      "p99 ms": formatNumber(result.streamLatencyMs.p99, 3),
      "max ms": formatNumber(result.streamLatencyMs.max, 3),
    },
  ]);
  console.table([
    {
      unary: result.unaryRequests,
      streams: result.streamRequests,
      "stream items": result.streamItems,
      "event-loop p95 ms": formatNumber(result.eventLoopDelayMs.p95, 3),
      "event-loop p99 ms": formatNumber(result.eventLoopDelayMs.p99, 3),
      "heap retained MB": formatNumber(result.memory.retainedHeapDeltaBytes / (1024 * 1024), 3),
      "heap peak MB": formatNumber(result.memory.peakHeapBytes / (1024 * 1024), 2),
      "RSS peak MB": formatNumber(result.memory.peakRssBytes / (1024 * 1024), 2),
      "peak active providers": result.lifecycle.peakActiveProviders,
    },
  ]);
}

function runtimeMarkdown(results: readonly RuntimeBenchResult[]): string {
  const lines = [
    "# Forma runtime benchmark",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "| Scenario | Arity | Depth | Providers | Iterations | Median ms | p95 ms | Median ns/op | Median ops/s | Heap median KB |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const result of results) {
    lines.push(
      `| ${result.config.scenario} | ${result.config.shape.arity} | ${result.config.shape.depth} | ${providerCountForShape(result.config.shape)} | ${result.config.iterations} | ${formatNumber(result.summary.durationMs.median)} | ${formatNumber(result.summary.durationMs.p95)} | ${formatNumber(result.summary.nsPerOperation.median, 0)} | ${formatNumber(result.summary.operationsPerSecond.median, 0)} | ${formatNumber(result.summary.heapDeltaBytes.median / 1024, 0)} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

function loadMarkdown(result: LoadResult): string {
  return [
    "# Forma soak/load test",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `- Shape: a${result.config.shape.arity}/d${result.config.shape.depth} (${providerCountForShape(result.config.shape)} Providers)`,
    `- Duration: ${formatNumber(result.durationMs / 1000)} s`,
    `- Concurrency: ${result.config.concurrency}`,
    `- Stream mix: ${result.config.streamPercent}%`,
    `- Completed: ${result.completed}`,
    `- Failed: ${result.failed}`,
    `- Throughput: ${formatNumber(result.operationsPerSecond, 0)} ops/s`,
    `- Sampled throughput p50/p95: ${formatNumber(result.throughputSamples.median, 0)} / ${formatNumber(result.throughputSamples.p95, 0)} ops/s`,
    `- Overall latency p50/p95/p99: ${formatNumber(result.latencyMs.median, 3)} / ${formatNumber(result.latencyMs.p95, 3)} / ${formatNumber(result.latencyMs.p99, 3)} ms`,
    `- Unary latency p50/p95/p99: ${formatNumber(result.unaryLatencyMs.median, 3)} / ${formatNumber(result.unaryLatencyMs.p95, 3)} / ${formatNumber(result.unaryLatencyMs.p99, 3)} ms`,
    `- Stream latency p50/p95/p99: ${formatNumber(result.streamLatencyMs.median, 3)} / ${formatNumber(result.streamLatencyMs.p95, 3)} / ${formatNumber(result.streamLatencyMs.p99, 3)} ms`,
    `- Event-loop delay p95/p99: ${formatNumber(result.eventLoopDelayMs.p95, 3)} / ${formatNumber(result.eventLoopDelayMs.p99, 3)} ms`,
    `- Retained heap delta: ${formatNumber(result.memory.retainedHeapDeltaBytes / (1024 * 1024), 3)} MB (GC exposed: ${result.memory.gcExposed})`,
    `- Peak active Providers: ${result.lifecycle.peakActiveProviders}`,
    `- Final active Providers: ${result.lifecycle.finalActiveProviders}`,
    "",
  ].join("\n");
}

function outputStamp(): string {
  return new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d{3}Z$/, "Z");
}

export async function writeRuntimeResults(
  outputRoot: string,
  results: readonly RuntimeBenchResult[]
): Promise<string> {
  const outputDirectory = resolve(outputRoot, outputStamp());
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    join(outputDirectory, "runtime.json"),
    `${JSON.stringify(
      {
        meta: {
          timestamp: new Date().toISOString(),
          runtime: { node: process.version, platform: process.platform, arch: process.arch },
        },
        results,
      },
      null,
      2
    )}\n`
  );
  await writeFile(join(outputDirectory, "runtime.md"), runtimeMarkdown(results));
  return outputDirectory;
}

export async function writeLoadResult(outputRoot: string, result: LoadResult): Promise<string> {
  const outputDirectory = resolve(outputRoot, outputStamp());
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    join(outputDirectory, "load.json"),
    `${JSON.stringify(
      {
        meta: {
          timestamp: new Date().toISOString(),
          runtime: { node: process.version, platform: process.platform, arch: process.arch },
        },
        result,
      },
      null,
      2
    )}\n`
  );
  await writeFile(join(outputDirectory, "load.md"), loadMarkdown(result));
  return outputDirectory;
}
