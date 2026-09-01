import { join } from "node:path";

import type { SchedulingMode } from "@xndrjs/resource-graph-resolver";

import { DEFAULT_MAX_NODES, type GraphProfile } from "./graph/generate";
import { executeBenchCase, formatCaseLabel } from "./runner/execute";
import { casesFromArgs, DEFAULT_MATRIX_DIMENSIONS, DEFAULT_SINGLE_RUN } from "./runner/matrix";
import { defaultResultDir, writeBenchArtifacts } from "./runner/report";
import type { RunnerCliArgs } from "./runner/types";

const HELP_TEXT = `Usage:
  pnpm --filter @xndrjs/resource-graph-resolver-bench bench:dev -- [options]
  pnpm --filter @xndrjs/resource-graph-resolver-bench bench -- [options]
  pnpm --filter @xndrjs/resource-graph-resolver-bench bench:matrix

Profiles:
  pagebuilder (default)  Wide page fan-out, shallow nesting, products at mixed depths
  tree                   Regular synthetic tree (depth × arity); products only at leaves

Options:
  --profile <name>              Graph profile (default: ${DEFAULT_SINGLE_RUN.profile})
  --modules <n>                 Page root fan-out (pagebuilder; default single: ${DEFAULT_SINGLE_RUN.modules}; matrix: ${DEFAULT_MATRIX_DIMENSIONS.modules.join(",")})
  --depth <n>                   Max CMS depth (default single: ${DEFAULT_SINGLE_RUN.depth}; matrix: ${DEFAULT_MATRIX_DIMENSIONS.depth.join(",")})
  --arity <n>                   Section/tree branch factor (default single: ${DEFAULT_SINGLE_RUN.arity}; matrix: ${DEFAULT_MATRIX_DIMENSIONS.arity.join(",")})
  --product-stride <n>          Early product every Nth sibling (pagebuilder; default: ${DEFAULT_SINGLE_RUN.productStride})
  --scheduling-mode <lane|barrier>  Walk scheduling mode (default single: ${DEFAULT_SINGLE_RUN.schedulingMode}; matrix: both)
  --cms-batch-size <n>          Max CMS batch size (default single: ${DEFAULT_SINGLE_RUN.cmsBatchSize}; matrix: ${DEFAULT_MATRIX_DIMENSIONS.cmsBatchSize.join(",")})
  --integration-batch-size <n>  Max integration batch size (default: ${DEFAULT_SINGLE_RUN.integrationBatchSize})
  --cms-latency-ms <n>          Simulated CMS RTT per load (default: ${DEFAULT_SINGLE_RUN.cmsLatencyMs})
  --integration-latency-ms <n>  Simulated integration RTT per load (default: ${DEFAULT_SINGLE_RUN.integrationLatencyMs})
  --cms-concurrency <n>         Parallel CMS loads (default: ${DEFAULT_SINGLE_RUN.cmsConcurrency}; not in baseline matrix axes)
  --integration-concurrency <n> Parallel integration loads (default: ${DEFAULT_SINGLE_RUN.integrationConcurrency})
  --warmup <n>                  Warmup resolves discarded before measure (default: ${DEFAULT_SINGLE_RUN.warmup})
  --repeats <n>                 Measured resolves per cell (default: ${DEFAULT_SINGLE_RUN.repeats})
  --max-nodes <n>               Fail if expected CMS nodes exceed this (default: ${DEFAULT_MAX_NODES})
  --output-dir <path>           Write raw.json / summary.json / comparison.md here
  --matrix                      Run the cartesian product (CLI scalars shrink an axis)
  --list                        Print matrix cells without running
  --help                        Show this help
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

function parseOptionalIntegerFlag(value: string | undefined, flagName: string): number | undefined {
  if (value === undefined) {
    return undefined;
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

function optionalNumberField<K extends string>(
  key: K,
  value: number | undefined
): Partial<Record<K, number>> {
  return value === undefined ? {} : ({ [key]: value } as Partial<Record<K, number>>);
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

  const outputDirValue = map.get("output-dir");
  const schedulingMode = ensureEnum(
    map.get("scheduling-mode") as string | undefined,
    ["lane", "barrier"],
    "scheduling-mode"
  ) as SchedulingMode | undefined;
  const profile = ensureEnum(
    map.get("profile") as string | undefined,
    ["pagebuilder", "tree"],
    "profile"
  ) as GraphProfile | undefined;

  return {
    ...(profile ? { profile } : {}),
    ...optionalNumberField(
      "modules",
      parseOptionalIntegerFlag(map.get("modules") as string | undefined, "--modules")
    ),
    ...optionalNumberField(
      "depth",
      parseOptionalIntegerFlag(map.get("depth") as string | undefined, "--depth")
    ),
    ...optionalNumberField(
      "arity",
      parseOptionalIntegerFlag(map.get("arity") as string | undefined, "--arity")
    ),
    ...optionalNumberField(
      "productStride",
      parseOptionalIntegerFlag(map.get("product-stride") as string | undefined, "--product-stride")
    ),
    ...(schedulingMode ? { schedulingMode } : {}),
    ...optionalNumberField(
      "cmsBatchSize",
      parseOptionalIntegerFlag(map.get("cms-batch-size") as string | undefined, "--cms-batch-size")
    ),
    ...optionalNumberField(
      "integrationBatchSize",
      parseOptionalIntegerFlag(
        map.get("integration-batch-size") as string | undefined,
        "--integration-batch-size"
      )
    ),
    ...optionalNumberField(
      "cmsLatencyMs",
      parseOptionalIntegerFlag(map.get("cms-latency-ms") as string | undefined, "--cms-latency-ms")
    ),
    ...optionalNumberField(
      "integrationLatencyMs",
      parseOptionalIntegerFlag(
        map.get("integration-latency-ms") as string | undefined,
        "--integration-latency-ms"
      )
    ),
    ...optionalNumberField(
      "cmsConcurrency",
      parseOptionalIntegerFlag(
        map.get("cms-concurrency") as string | undefined,
        "--cms-concurrency"
      )
    ),
    ...optionalNumberField(
      "integrationConcurrency",
      parseOptionalIntegerFlag(
        map.get("integration-concurrency") as string | undefined,
        "--integration-concurrency"
      )
    ),
    ...(typeof outputDirValue === "string" ? { outputDir: outputDirValue } : {}),
    warmup: parseIntegerFlag(map.get("warmup") as string | undefined, 1, "--warmup"),
    repeats: parseIntegerFlag(map.get("repeats") as string | undefined, 5, "--repeats"),
    maxNodes: parseIntegerFlag(
      map.get("max-nodes") as string | undefined,
      DEFAULT_MAX_NODES,
      "--max-nodes"
    ),
    matrix: map.has("matrix"),
    list: map.has("list"),
    help: map.has("help"),
  };
}

function assertRunnable(args: RunnerCliArgs): void {
  if (args.warmup < 0) {
    throw new Error(`"--warmup" must be >= 0.`);
  }
  if (args.repeats <= 0) {
    throw new Error(`"--repeats" must be > 0.`);
  }
  if (args.maxNodes <= 0) {
    throw new Error(`"--max-nodes" must be > 0.`);
  }

  const positiveFlags: [keyof RunnerCliArgs, string][] = [
    ["modules", "--modules"],
    ["depth", "--depth"],
    ["arity", "--arity"],
    ["productStride", "--product-stride"],
    ["cmsBatchSize", "--cms-batch-size"],
    ["integrationBatchSize", "--integration-batch-size"],
    ["cmsConcurrency", "--cms-concurrency"],
    ["integrationConcurrency", "--integration-concurrency"],
  ];
  for (const [key, flag] of positiveFlags) {
    const value = args[key];
    if (typeof value === "number" && value <= 0) {
      throw new Error(`"${flag}" must be > 0.`);
    }
  }

  const nonNegativeFlags: [keyof RunnerCliArgs, string][] = [
    ["cmsLatencyMs", "--cms-latency-ms"],
    ["integrationLatencyMs", "--integration-latency-ms"],
  ];
  for (const [key, flag] of nonNegativeFlags) {
    const value = args[key];
    if (typeof value === "number" && value < 0) {
      throw new Error(`"${flag}" must be >= 0.`);
    }
  }
}

export async function runCli(argv: readonly string[]): Promise<number> {
  try {
    const args = parseRunnerArgs(argv);
    if (args.help) {
      console.log(HELP_TEXT);
      return 0;
    }

    assertRunnable(args);
    const cases = casesFromArgs(args);

    if (args.list) {
      console.log(`Matrix cells (${cases.length}):`);
      for (const cell of cases) {
        console.log(`  ${formatCaseLabel(cell)}`);
      }
      return 0;
    }

    if (cases.length === 0) {
      throw new Error("No benchmark cells to run.");
    }

    console.error(
      `[resource-graph-resolver-bench] Running ${cases.length} cell(s) (warmup=${args.warmup}, repeats=${args.repeats})…`
    );

    const results = [];
    for (let index = 0; index < cases.length; index += 1) {
      const cell = cases[index]!;
      console.error(
        `[resource-graph-resolver-bench] (${index + 1}/${cases.length}) ${formatCaseLabel(cell)}`
      );
      results.push(await executeBenchCase(cell));
    }

    const outputDir = args.outputDir ?? defaultResultDir();
    await writeBenchArtifacts(outputDir, results, { matrix: args.matrix || cases.length > 1 });

    const stdoutPayload = {
      outputDir,
      cells: results.map((cell) => ({
        config: cell.config,
        graph: cell.graph,
        wallMs: cell.summary.wallMs,
        batchCount: cell.summary.batchCount,
        bySource: Object.fromEntries(
          Object.entries(cell.summary.bySource).map(([sourceId, metrics]) => [
            sourceId,
            {
              batchCount: metrics.batchCount,
              effectiveBatchSizeMean: metrics.effectiveBatchSizeMean,
              effectiveBatchSizeMedian: metrics.effectiveBatchSizeMedian,
            },
          ])
        ),
      })),
    };
    console.log(JSON.stringify(stdoutPayload, null, 2));
    console.error(`[resource-graph-resolver-bench] Wrote artifacts to ${join(outputDir)}`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[resource-graph-resolver-bench] ${message}`);
    console.error(HELP_TEXT);
    return 1;
  }
}
