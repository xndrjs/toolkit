import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { apply } from "../apply/apply";
import { prune } from "../apply/prune";
import { emitPopulateApi } from "../codegen/emit-populate-api";
import { inspect } from "../inspect/inspect";
import { parseCliArgs, printCliHelp, type CliOptions } from "./args";
import { loadStructure, loadPopulation } from "./load-module";
import { migrateId } from "./migrate-id";

/**
 * Run the wave-1 CLI. Returns a process exit code (0 success, 1 failure).
 */
export async function runCli(argv: string[]): Promise<number> {
  let options: CliOptions;
  try {
    options = parseCliArgs(argv);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`struttura: ${message}`);
    printCliHelp();
    return 1;
  }

  if (options.command === "help" || options.help) {
    printCliHelp();
    return 0;
  }

  try {
    switch (options.command) {
      case "codegen":
        return await runCodegen(options);
      case "apply":
        return await runApply(options);
      case "inspect":
        return await runInspect(options);
      case "prune":
        return await runPrune(options);
      case "migrate-id":
        return runMigrateId(options);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`struttura: ${message}`);
    return 1;
  }
}

async function runCodegen(options: Extract<CliOptions, { command: "codegen" }>): Promise<number> {
  const structure = await loadStructure(options.structure);
  const outAbs = resolve(options.out);
  const structureAbs = resolve(options.structure);
  const structureModule =
    options.structureModule ?? toImportSpecifier(relative(dirname(outAbs), structureAbs));

  const { source, stamp } = emitPopulateApi(structure, {
    structureModule,
    structureExport: options.structureExport,
    constructsExport: options.constructsExport,
    strutturaPackage: options.strutturaPackage,
  });

  mkdirSync(dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, source, "utf8");
  console.log(`struttura codegen: wrote ${outAbs} (stamp ${stamp.slice(0, 12)}…)`);
  return 0;
}

async function runApply(options: Extract<CliOptions, { command: "apply" }>): Promise<number> {
  const population = await loadPopulation(options.population);
  const result = apply(population, {
    structureDir: options.structureDir,
    materializationRoot: options.materializationRoot,
    prune: options.prune,
    sync: options.sync,
  });
  if (!result.ok) {
    printDiagnostics(result.diagnostics);
    return 1;
  }
  console.log(
    result.mutated
      ? `struttura apply: applied ${String(result.plan.length)} op(s); manifest updated.`
      : "struttura apply: no changes (inputs and disk already match)."
  );
  if (options.zombieWarn && result.zombies.length > 0) {
    console.warn(
      `struttura apply: warning: ${String(result.zombies.length)} zombie artifact(s) retained (run \`struttura prune\` to remove). Use --no-zombie-warn to hide.`
    );
  }
  return 0;
}

async function runInspect(options: Extract<CliOptions, { command: "inspect" }>): Promise<number> {
  const population = await loadPopulation(options.population);
  const result = inspect(population, {
    structureDir: options.structureDir,
    materializationRoot: options.materializationRoot,
    repositoryRoot: options.repositoryRoot,
    prune: options.prune,
    sync: options.sync,
  });
  if (!result.ok) {
    printDiagnostics(result.diagnostics);
    return 1;
  }

  if (options.json) {
    console.log(JSON.stringify(result.report, null, 2));
    return 0;
  }

  const { report } = result;
  console.log(`repository:      ${report.roots.repository}`);
  console.log(`structure:       ${report.roots.structure}`);
  console.log(`materialization: ${report.roots.materialization}`);
  console.log(`instances:       ${String(report.instances.length)}`);
  console.log(`artifacts:       ${String(report.artifacts.length)}`);
  console.log(`zombies:         ${String(report.zombies.length)}`);
  console.log(`plan ops:        ${String(report.plan.length)}`);
  console.log(`prune ops:       ${String(report.prunePlan.length)}`);
  console.log(
    `would mutate:    disk=${String(report.wouldMutateDisk)} manifest=${String(report.wouldUpdateManifest)}`
  );
  if (report.zombies.length > 0) {
    console.log("zombies:");
    for (const zombie of report.zombies) {
      console.log(`  ${zombie.path} (${zombie.instanceId}::${zombie.artifactKey})`);
    }
  }
  if (report.plan.length > 0) {
    console.log("plan:");
    for (const op of report.plan) {
      console.log(`  ${formatPlanOp(op)}`);
    }
  }
  return 0;
}

async function runPrune(options: Extract<CliOptions, { command: "prune" }>): Promise<number> {
  const population = await loadPopulation(options.population);
  const result = prune(population, {
    structureDir: options.structureDir,
    materializationRoot: options.materializationRoot,
  });
  if (!result.ok) {
    printDiagnostics(result.diagnostics);
    return 1;
  }
  console.log(
    result.mutated
      ? `struttura prune: removed ${String(result.plan.length)} artifact(s); manifest updated.`
      : "struttura prune: no zombies to remove."
  );
  return 0;
}

function runMigrateId(options: Extract<CliOptions, { command: "migrate-id" }>): number {
  const result = migrateId({
    structureDir: options.structureDir,
    from: options.from,
    to: options.to,
  });
  if (!result.ok) {
    for (const diagnostic of result.diagnostics) {
      console.error(`struttura migrate-id: [${diagnostic.code}] ${diagnostic.message}`);
    }
    return 1;
  }
  console.log(
    result.mutated
      ? `struttura migrate-id: ${options.from} → ${options.to}`
      : `struttura migrate-id: no changes`
  );
  return 0;
}

function printDiagnostics(diagnostics: readonly { code: string; message: string }[]): void {
  for (const diagnostic of diagnostics) {
    console.error(`struttura: [${diagnostic.code}] ${diagnostic.message}`);
  }
}

function formatPlanOp(op: {
  type: string;
  path?: string;
  from?: string;
  to?: string;
  kind?: string;
}): string {
  if (op.type === "move") {
    return `move ${op.from ?? "?"} → ${op.to ?? "?"}`;
  }
  return `${op.type}${op.kind ? `:${op.kind}` : ""} ${op.path ?? ""}`.trim();
}

function toImportSpecifier(relativePath: string): string {
  let spec = relativePath.split("\\").join("/");
  if (spec.endsWith(".ts")) {
    spec = spec.slice(0, -3);
  } else if (spec.endsWith(".tsx")) {
    spec = spec.slice(0, -4);
  } else if (spec.endsWith(".js")) {
    spec = spec.slice(0, -3);
  }
  if (!spec.startsWith(".")) {
    spec = `./${spec}`;
  }
  return spec;
}
