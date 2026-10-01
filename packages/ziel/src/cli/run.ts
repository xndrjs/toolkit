import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { Diagnostic } from "../check";
import { buildGeneratedModule } from "../compile/codegen/build-generated-module";
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

type GenerateResult = {
  code: string;
  diagnostics: readonly Diagnostic[];
  wrote: boolean;
};

function generateOnce(
  options: ResolvedCliOptions,
  config: ZielCodegenConfig | undefined
): GenerateResult {
  const { code, diagnostics } = buildGeneratedModule({
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
    return { code, diagnostics, wrote: false };
  }

  if (options.dryRun) {
    process.stdout.write(code);
    return { code, diagnostics, wrote: false };
  }

  const outPath = resolve(options.out!);
  const wrote = writeFileIfChanged(outPath, code);
  return { code, diagnostics, wrote };
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

    if (options.dryRun) {
      console.error(`ziel-codegen: watch (${reason}) — wrote stdout (dry-run)`);
    } else if (result.wrote) {
      console.error(`ziel-codegen: watch (${reason}) — wrote ${resolve(options.out!)}`);
    } else {
      console.error(`ziel-codegen: watch (${reason}) — unchanged ${resolve(options.out!)}`);
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

  const result = generateOnce(options, config);
  if (result.diagnostics.length > 0) {
    logDiagnostics(result.diagnostics);
    return 1;
  }

  return 0;
}
