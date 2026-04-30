import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";

import type { BenchmarkEngine, BenchmarkMode } from "../adapters";
import type { RunnerJsonOutput } from "./types";

function sanitizeToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function utcTimestampToken(date: Date): string {
  return date.toISOString().replace(/[:]/g, "-").replace(/\..+$/, "Z");
}

function safeCommitHash(): string {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .slice(0, 12);
  } catch {
    return "no-git";
  }
}

export function defaultResultDir(args: {
  scenario: string;
  mode: BenchmarkMode;
  inputSize: number;
  now?: Date;
}): string {
  const now = args.now ?? new Date();
  const stamp = utcTimestampToken(now);
  const hash = safeCommitHash();
  const scenario = sanitizeToken(args.scenario);
  return join("results", scenario, `${stamp}-${hash}`, `${args.mode}-${args.inputSize}`);
}

export async function writeJsonOutput(path: string, output: RunnerJsonOutput): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(output, null, 2)}\n`, "utf8");
}

export function renderComparisonMarkdown(outputs: readonly RunnerJsonOutput[]): string {
  if (outputs.length === 0) {
    return "# Benchmark comparison\n\nNo benchmark results available.\n";
  }

  const first = outputs[0];
  if (!first) {
    return "# Benchmark comparison\n\nNo benchmark results available.\n";
  }
  const { meta } = first;
  const lines: string[] = [];
  lines.push("# Benchmark comparison");
  lines.push("");
  lines.push(`- Scenario: \`${meta.scenario}\``);
  lines.push(`- Mode: \`${meta.mode}\``);
  lines.push(`- Input size: \`${meta.inputSize}\``);
  lines.push(`- Warmup: \`${meta.warmup}\``);
  lines.push(`- Repeats: \`${meta.repeats}\``);
  lines.push(`- Seed: \`${meta.seed}\``);
  lines.push("");
  lines.push(
    "| Engine | Ops/s (median) | Ops/s (p95) | ms/op (median) | Heap delta bytes (median) |"
  );
  lines.push("| --- | ---: | ---: | ---: | ---: |");

  for (const output of outputs) {
    lines.push(
      `| ${output.meta.engine} | ${output.summary.opsPerSec.median.toFixed(2)} | ${output.summary.opsPerSec.p95.toFixed(2)} | ${output.summary.msPerOp.median.toFixed(6)} | ${output.summary.heapDeltaBytes.median.toFixed(0)} |`
    );
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- Higher ops/s is better.");
  lines.push("- Lower ms/op is better.");
  lines.push("- Heap delta can be noisy and should be interpreted comparatively.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function writeMarkdownReport(path: string, markdown: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, markdown, "utf8");
}

export function sortByEngine(outputs: readonly RunnerJsonOutput[]): RunnerJsonOutput[] {
  const order: Record<BenchmarkEngine, number> = {
    zod: 0,
    valibot: 1,
    core: 2,
    raw: 3,
  };
  return [...outputs].sort((a, b) => order[a.meta.engine] - order[b.meta.engine]);
}
