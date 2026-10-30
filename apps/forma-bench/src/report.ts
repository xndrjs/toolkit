import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { RuntimeBenchResult, StressCheck } from "./runtime/types";
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

export async function writeRuntimeResults(
  outputRoot: string,
  results: readonly RuntimeBenchResult[]
): Promise<string> {
  const stamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d{3}Z$/, "Z");
  const outputDirectory = resolve(outputRoot, stamp);
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
