import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { CMS_SOURCE_ID } from "../sources/cms-source";
import { INTEGRATION_SOURCE_ID } from "../sources/integration-source";
import type {
  BenchCaseConfig,
  BenchCaseResult,
  BenchRawOutput,
  BenchRunMeta,
  BenchSummaryOutput,
} from "./types";

function utcTimestampToken(date: Date): string {
  return date.toISOString().replace(/[:]/g, "-").replace(/\..+$/, "Z");
}

/** `results/<iso-stamp>/` under cwd (or absolute `--output-dir`). */
export function defaultResultDir(now: Date = new Date()): string {
  return join("results", utcTimestampToken(now));
}

export function createRunMeta(args: {
  readonly matrix: boolean;
  readonly cellCount: number;
  readonly now?: Date;
}): BenchRunMeta {
  const now = args.now ?? new Date();
  return {
    timestamp: now.toISOString(),
    matrix: args.matrix,
    cellCount: args.cellCount,
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  };
}

export function buildRawOutput(
  meta: BenchRunMeta,
  cells: readonly BenchCaseResult[]
): BenchRawOutput {
  type RawRun = BenchRawOutput["runs"][number];
  const runs: RawRun[] = [];
  for (const cell of cells) {
    cell.repeats.forEach((metrics, index) => {
      runs.push({
        config: cell.config,
        graph: cell.graph,
        repeatIndex: index + 1,
        metrics,
      });
    });
  }
  return { meta, runs };
}

export function buildSummaryOutput(
  meta: BenchRunMeta,
  cells: readonly BenchCaseResult[]
): BenchSummaryOutput {
  return {
    meta,
    cells: cells.map((cell) => ({
      config: cell.config,
      graph: cell.graph,
      summary: cell.summary,
    })),
  };
}

export async function writeJsonOutput(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeMarkdownReport(path: string, markdown: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, markdown, "utf8");
}

/** Pairing key: all dimensions except scheduling mode (for lane vs barrier deltas). */
function pairKey(config: BenchCaseConfig): string {
  return [
    config.profile,
    config.modules,
    config.depth,
    config.arity,
    config.productStride,
    config.cmsBatchSize,
    config.integrationBatchSize,
    config.cmsLatencyMs,
    config.integrationLatencyMs,
    config.cmsConcurrency,
    config.integrationConcurrency,
  ].join("|");
}

type StrategyPair = {
  readonly key: string;
  readonly profile: string;
  readonly modules: number;
  readonly depth: number;
  readonly arity: number;
  readonly productStride: number;
  readonly cmsBatchSize: number;
  readonly integrationBatchSize: number;
  readonly cmsLatencyMs: number;
  readonly integrationLatencyMs: number;
  readonly lane?: BenchCaseResult;
  readonly barrier?: BenchCaseResult;
};

function groupStrategyPairs(cells: readonly BenchCaseResult[]): StrategyPair[] {
  const map = new Map<string, StrategyPair>();

  for (const cell of cells) {
    const key = pairKey(cell.config);
    const existing = map.get(key) ?? {
      key,
      profile: cell.config.profile,
      modules: cell.config.modules,
      depth: cell.config.depth,
      arity: cell.config.arity,
      productStride: cell.config.productStride,
      cmsBatchSize: cell.config.cmsBatchSize,
      integrationBatchSize: cell.config.integrationBatchSize,
      cmsLatencyMs: cell.config.cmsLatencyMs,
      integrationLatencyMs: cell.config.integrationLatencyMs,
    };
    if (cell.config.schedulingMode === "lane") {
      map.set(key, { ...existing, lane: cell });
    } else {
      map.set(key, { ...existing, barrier: cell });
    }
  }

  return [...map.values()].sort((a, b) => {
    if (a.profile !== b.profile) return a.profile.localeCompare(b.profile);
    if (a.modules !== b.modules) return a.modules - b.modules;
    if (a.depth !== b.depth) return a.depth - b.depth;
    if (a.arity !== b.arity) return a.arity - b.arity;
    if (a.productStride !== b.productStride) return a.productStride - b.productStride;
    if (a.cmsBatchSize !== b.cmsBatchSize) return a.cmsBatchSize - b.cmsBatchSize;
    return a.integrationBatchSize - b.integrationBatchSize;
  });
}

function fmt(value: number, digits = 2): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return value.toFixed(digits);
}

/**
 * `(lane - barrier) / barrier * 100`.
 * Negative wall Δ% means lane is faster.
 */
function pctDelta(lane: number | undefined, barrier: number | undefined): string {
  if (lane === undefined || barrier === undefined || barrier === 0) {
    return "—";
  }
  return `${(((lane - barrier) / barrier) * 100).toFixed(1)}%`;
}

function medianOf(cell: BenchCaseResult | undefined, pick: (c: BenchCaseResult) => number): string {
  if (!cell) {
    return "—";
  }
  return fmt(pick(cell));
}

function sourceEffective(
  cell: BenchCaseResult | undefined,
  sourceId: string,
  field: "effectiveBatchSizeMean" | "effectiveBatchSizeMedian" | "effectiveBatchSizeP95"
): number | undefined {
  const source = cell?.summary.bySource[sourceId];
  return source?.[field].median;
}

function fillShare(
  cell: BenchCaseResult | undefined,
  sourceId: string,
  bucket: "full" | "eq1" | "lteHalf" | "belowFull"
): string {
  const hist = cell?.summary.bySource[sourceId]?.fillHistogram;
  if (!hist || hist.total === 0) {
    return "—";
  }
  return fmt((hist[bucket] / hist.total) * 100, 1);
}

export function renderComparisonMarkdown(cells: readonly BenchCaseResult[]): string {
  if (cells.length === 0) {
    return "# Scheduler benchmark comparison\n\nNo benchmark results available.\n";
  }

  const first = cells[0]!;
  const lines: string[] = [];
  lines.push("# Scheduler benchmark comparison");
  lines.push("");
  lines.push(`- Cells: \`${cells.length}\``);
  lines.push(`- Profile (typical): \`${first.config.profile}\``);
  lines.push(`- Warmup: \`${first.config.warmup}\``);
  lines.push(`- Repeats: \`${first.config.repeats}\``);
  lines.push(
    `- CMS / integration latency (typical): \`${first.config.cmsLatencyMs}ms\` / \`${first.config.integrationLatencyMs}ms\``
  );
  lines.push("");
  lines.push("## Questions this report answers");
  lines.push("");
  lines.push(
    "1. At the same graph and configured batch size, does **lane reduce wall clock** vs barrier when integration latency ≫ CMS latency?"
  );
  lines.push(
    "2. How do **batchCount and wall** scale as page size (`modules`) / arity grows and `cmsBatchSize` changes?"
  );
  lines.push(
    "3. At the same configured `cmsBatchSize` max, how do **effective** batch sizes differ between lane and barrier (mean / median / p95, and full vs under-filled share)?"
  );
  lines.push("");
  lines.push(
    "Δ% is `(lane − barrier) / barrier × 100`. For wall clock, **negative** means lane is faster."
  );
  lines.push("");

  const pairs = groupStrategyPairs(cells);

  lines.push("## Wall clock (median ms)");
  lines.push("");
  lines.push(
    "| profile | modules | depth | arity | stride | cmsBatch | graph (cms+prod) | lane | barrier | Δ% |"
  );
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const pair of pairs) {
    const graph = pair.lane?.graph ?? pair.barrier?.graph;
    const graphLabel = graph ? `${graph.cmsNodeCount}+${graph.productCount}` : "—";
    lines.push(
      `| ${pair.profile} | ${pair.modules} | ${pair.depth} | ${pair.arity} | ${pair.productStride} | ${pair.cmsBatchSize} | ${graphLabel} | ${medianOf(pair.lane, (c) => c.summary.wallMs.median)} | ${medianOf(pair.barrier, (c) => c.summary.wallMs.median)} | ${pctDelta(pair.lane?.summary.wallMs.median, pair.barrier?.summary.wallMs.median)} |`
    );
  }
  lines.push("");

  lines.push("## Batch count (median)");
  lines.push("");
  lines.push("| profile | modules | depth | arity | stride | cmsBatch | lane | barrier | Δ% |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const pair of pairs) {
    lines.push(
      `| ${pair.profile} | ${pair.modules} | ${pair.depth} | ${pair.arity} | ${pair.productStride} | ${pair.cmsBatchSize} | ${medianOf(pair.lane, (c) => c.summary.batchCount.median)} | ${medianOf(pair.barrier, (c) => c.summary.batchCount.median)} | ${pctDelta(pair.lane?.summary.batchCount.median, pair.barrier?.summary.batchCount.median)} |`
    );
  }
  lines.push("");

  lines.push("## Effective batch size — CMS (`onBatchStart.resourceCount`)");
  lines.push("");
  lines.push(
    "Values are **median across repeats** of each run's mean / median / p95 effective size."
  );
  lines.push("");
  lines.push(
    "| profile | modules | cmsBatch | lane mean | barrier mean | lane median | barrier median | lane p95 | barrier p95 |"
  );
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const pair of pairs) {
    lines.push(
      `| ${pair.profile} | ${pair.modules} | ${pair.cmsBatchSize} | ${fmt(sourceEffective(pair.lane, CMS_SOURCE_ID, "effectiveBatchSizeMean") ?? Number.NaN)} | ${fmt(sourceEffective(pair.barrier, CMS_SOURCE_ID, "effectiveBatchSizeMean") ?? Number.NaN)} | ${fmt(sourceEffective(pair.lane, CMS_SOURCE_ID, "effectiveBatchSizeMedian") ?? Number.NaN)} | ${fmt(sourceEffective(pair.barrier, CMS_SOURCE_ID, "effectiveBatchSizeMedian") ?? Number.NaN)} | ${fmt(sourceEffective(pair.lane, CMS_SOURCE_ID, "effectiveBatchSizeP95") ?? Number.NaN)} | ${fmt(sourceEffective(pair.barrier, CMS_SOURCE_ID, "effectiveBatchSizeP95") ?? Number.NaN)} |`
    );
  }
  lines.push("");

  lines.push("## Effective batch size — integration");
  lines.push("");
  lines.push(
    "| profile | modules | cmsBatch | lane mean | barrier mean | lane median | barrier median | lane p95 | barrier p95 |"
  );
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const pair of pairs) {
    lines.push(
      `| ${pair.profile} | ${pair.modules} | ${pair.cmsBatchSize} | ${fmt(sourceEffective(pair.lane, INTEGRATION_SOURCE_ID, "effectiveBatchSizeMean") ?? Number.NaN)} | ${fmt(sourceEffective(pair.barrier, INTEGRATION_SOURCE_ID, "effectiveBatchSizeMean") ?? Number.NaN)} | ${fmt(sourceEffective(pair.lane, INTEGRATION_SOURCE_ID, "effectiveBatchSizeMedian") ?? Number.NaN)} | ${fmt(sourceEffective(pair.barrier, INTEGRATION_SOURCE_ID, "effectiveBatchSizeMedian") ?? Number.NaN)} | ${fmt(sourceEffective(pair.lane, INTEGRATION_SOURCE_ID, "effectiveBatchSizeP95") ?? Number.NaN)} | ${fmt(sourceEffective(pair.barrier, INTEGRATION_SOURCE_ID, "effectiveBatchSizeP95") ?? Number.NaN)} |`
    );
  }
  lines.push("");

  lines.push("## CMS fill share (% of batches)");
  lines.push("");
  lines.push(
    "Buckets vs configured max: `eq1` (≤1), `lteHalf` (≤50%), `belowFull` (50%–max), `full` (≥max)."
  );
  lines.push("");
  lines.push(
    "| profile | modules | cmsBatch | lane full% | barrier full% | lane eq1% | barrier eq1% | lane ≤50% | barrier ≤50% |"
  );
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const pair of pairs) {
    lines.push(
      `| ${pair.profile} | ${pair.modules} | ${pair.cmsBatchSize} | ${fillShare(pair.lane, CMS_SOURCE_ID, "full")} | ${fillShare(pair.barrier, CMS_SOURCE_ID, "full")} | ${fillShare(pair.lane, CMS_SOURCE_ID, "eq1")} | ${fillShare(pair.barrier, CMS_SOURCE_ID, "eq1")} | ${fillShare(pair.lane, CMS_SOURCE_ID, "lteHalf")} | ${fillShare(pair.barrier, CMS_SOURCE_ID, "lteHalf")} |`
    );
  }
  lines.push("");

  lines.push("## Overlap (median ms with ≥2 batches in flight)");
  lines.push("");
  lines.push("| profile | modules | cmsBatch | lane | barrier |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");
  for (const pair of pairs) {
    lines.push(
      `| ${pair.profile} | ${pair.modules} | ${pair.cmsBatchSize} | ${medianOf(pair.lane, (c) => c.summary.overlapMs.median)} | ${medianOf(pair.barrier, (c) => c.summary.overlapMs.median)} |`
    );
  }
  lines.push("");

  if (pairs.every((p) => !p.lane || !p.barrier)) {
    lines.push("## Notes");
    lines.push("");
    lines.push(
      "- This run did not include both `lane` and `barrier` for the same dimensions, so Δ% columns are empty. Re-run with `--matrix` (or both strategies) for pairwise deltas."
    );
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

export async function writeBenchArtifacts(
  outputDir: string,
  cells: readonly BenchCaseResult[],
  options: { readonly matrix: boolean }
): Promise<{ readonly outputDir: string }> {
  const meta = createRunMeta({ matrix: options.matrix, cellCount: cells.length });
  await writeJsonOutput(join(outputDir, "raw.json"), buildRawOutput(meta, cells));
  await writeJsonOutput(join(outputDir, "summary.json"), buildSummaryOutput(meta, cells));
  await writeMarkdownReport(join(outputDir, "comparison.md"), renderComparisonMarkdown(cells));
  return { outputDir };
}
