import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

import type { Diagnostic } from "../check";
import { buildGeneratedModule } from "../compile/codegen/build-generated-module";
import type { GeneratedModuleFile } from "../compile/codegen/compose-generated-module";
import type { ZielCodegenConfig } from "../compile/config/define-config";
import {
  parseCliArgs,
  printCliHelp,
  resolveCliOptions,
  validateCliOptions,
  type CliOptions,
  type ResolvedCliOptions,
} from "./args";
import { loadConfigFile } from "./load-config";
import { removeStaleManagedOutputs } from "./remove-stale-managed-outputs";
import { waitForSignal, watchCodegenInputs, type WatchCodegenPaths } from "./watch";
import { writeFileIfChanged } from "./write-file-if-changed";

/** Default config filename looked up in cwd when `--config` is omitted. */
export const DEFAULT_CONFIG_PATH = "ziel.config.ts";

function formatDiagnostic(diagnostic: Diagnostic): string {
  const loc = diagnostic.path ? ` at ${diagnostic.path}` : "";
  return `ziel-codegen: ${diagnostic.code}: ${diagnostic.message}${loc}`;
}

async function resolveConfig(
  cliOptions: CliOptions,
  allowMissing = false
): Promise<{
  config: ZielCodegenConfig | undefined;
  configPath: string;
}> {
  const configPath = cliOptions.configPath ?? DEFAULT_CONFIG_PATH;
  const absolute = resolve(configPath);

  if (!existsSync(absolute)) {
    if (cliOptions.configPath && !allowMissing) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    return { config: undefined, configPath: absolute };
  }

  return { config: await loadConfigFile(configPath), configPath: absolute };
}

/**
 * Reject `out` values that look like a single TypeScript/JavaScript file, or an
 * existing non-directory path. `out` is always a directory for multi-file emit.
 */
export function validateOutDirectory(out: string): void {
  if (/\.(?:[cm]?[jt]s|[jt]sx)$/i.test(out)) {
    throw new Error(`--out must be a directory for multi-file codegen (got a file path: ${out})`);
  }

  const absolute = resolve(out);
  if (!existsSync(absolute)) return;

  if (!statSync(absolute).isDirectory()) {
    throw new Error(
      `--out must be a directory for multi-file codegen (existing path is not a directory: ${out})`
    );
  }
}

type GenerateResult = {
  files: GeneratedModuleFile[];
  diagnostics: readonly Diagnostic[];
  /** True when any file was written or a stale managed file was removed. */
  changed: boolean;
  writtenPaths: string[];
  deletedPaths: string[];
};

function printDryRun(files: readonly GeneratedModuleFile[]): void {
  for (const file of files) {
    process.stdout.write(`// ===== ${file.relativePath} =====\n`);
    process.stdout.write(file.code);
    if (!file.code.endsWith("\n")) {
      process.stdout.write("\n");
    }
  }
}

function generateOnce(
  options: ResolvedCliOptions,
  config: ZielCodegenConfig | undefined
): GenerateResult {
  const { files, diagnostics } = buildGeneratedModule({
    root: options.root,
    include: config?.include,
    exclude: config?.exclude,
    pathFilter: config?.pathFilter,
    importFrom: config?.importFrom,
    registryTypeName: config?.registryTypeName,
    resourceTag: config?.resourceTag,
    requireDatasourceCoverage: config?.requireDatasourceCoverage,
  });

  if (diagnostics.length > 0) {
    return { files, diagnostics, changed: false, writtenPaths: [], deletedPaths: [] };
  }

  if (options.dryRun) {
    printDryRun(files);
    return { files, diagnostics, changed: false, writtenPaths: [], deletedPaths: [] };
  }

  const outDir = resolve(options.out!);
  const writtenPaths: string[] = [];
  for (const file of files) {
    const absolutePath = resolve(outDir, file.relativePath);
    if (writeFileIfChanged(absolutePath, file.code)) {
      writtenPaths.push(file.relativePath);
    }
  }

  const deletedPaths = removeStaleManagedOutputs(
    outDir,
    files.map((file) => file.relativePath)
  );

  return {
    files,
    diagnostics,
    changed: writtenPaths.length > 0 || deletedPaths.length > 0,
    writtenPaths,
    deletedPaths,
  };
}

function logDiagnostics(diagnostics: readonly Diagnostic[]): void {
  for (const diagnostic of diagnostics) {
    console.error(formatDiagnostic(diagnostic));
  }
}

async function runWatchMode(cliOptions: CliOptions): Promise<number> {
  const runPass = async (
    reason: string
  ): Promise<{ exitCode: number; paths: WatchCodegenPaths }> => {
    const { config, configPath } = await resolveConfig(cliOptions, true);
    const options = resolveCliOptions(cliOptions, config);
    validateCliOptions(options);
    if (options.out) {
      validateOutDirectory(options.out);
    }
    const paths = {
      root: resolve(options.root ?? process.cwd()),
      configPath,
      outPath: options.dryRun || !options.out ? undefined : resolve(options.out),
    };

    const result = generateOnce(options, config);
    if (result.diagnostics.length > 0) {
      logDiagnostics(result.diagnostics);
      console.error(`ziel-codegen: watch (${reason}) — generation failed`);
      return { exitCode: 1, paths };
    }

    const outDir = resolve(options.out!);
    if (result.changed) {
      const parts: string[] = [];
      if (result.writtenPaths.length > 0) {
        parts.push(`wrote ${result.writtenPaths.length} file(s)`);
      }
      if (result.deletedPaths.length > 0) {
        parts.push(`removed ${result.deletedPaths.length} stale file(s)`);
      }
      console.error(`ziel-codegen: watch (${reason}) — ${parts.join(", ")} under ${outDir}`);
    } else {
      console.error(`ziel-codegen: watch (${reason}) — unchanged ${outDir}`);
    }
    return { exitCode: 0, paths };
  };

  // Initial pass before arming watchers.
  const initial = await runPass("initial");
  console.error(`ziel-codegen: watching ${initial.paths.root} for .ziel changes (Ctrl+C to stop)`);

  const controller = await watchCodegenInputs({
    ...initial.paths,
    onChange: async (reason) => {
      const next = await runPass(reason);
      await controller.reconfigure(next.paths);
    },
  });

  try {
    await waitForSignal();
  } finally {
    await controller.close();
  }

  return initial.exitCode;
}

export async function runCli(argv: string[]): Promise<number> {
  const cliOptions = parseCliArgs(argv);

  if (cliOptions.help) {
    printCliHelp();
    return 0;
  }

  if (cliOptions.watch) {
    return runWatchMode(cliOptions);
  }

  const { config } = await resolveConfig(cliOptions);
  const options = resolveCliOptions(cliOptions, config);
  validateCliOptions(options);
  if (options.out) {
    validateOutDirectory(options.out);
  }

  const result = generateOnce(options, config);
  if (result.diagnostics.length > 0) {
    logDiagnostics(result.diagnostics);
    return 1;
  }

  return 0;
}
