import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { Diagnostic } from "../check";
import { buildResources } from "../compile/codegen/build-resources";
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
import { waitForSignal, watchCodegenInputs } from "./watch";
import { writeFileIfChanged } from "./write-file-if-changed";

/** Default config filename looked up in cwd when `--config` is omitted. */
export const DEFAULT_CONFIG_PATH = "ziel.config.ts";

function formatDiagnostic(diagnostic: Diagnostic): string {
  const loc = diagnostic.path ? ` at ${diagnostic.path}` : "";
  return `ziel-codegen: ${diagnostic.code}: ${diagnostic.message}${loc}`;
}

async function resolveConfig(cliOptions: CliOptions): Promise<{
  config: ZielCodegenConfig | undefined;
  configPath: string | undefined;
}> {
  const configPath = cliOptions.configPath ?? DEFAULT_CONFIG_PATH;
  const absolute = resolve(configPath);

  if (!existsSync(absolute)) {
    if (cliOptions.configPath) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    return { config: undefined, configPath: undefined };
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
  const { code, diagnostics } = buildResources({
    root: options.root,
    include: config?.include,
    exclude: config?.exclude,
    pathFilter: config?.pathFilter,
    importFrom: config?.importFrom,
    registryTypeName: config?.registryTypeName,
    resourceTag: config?.resourceTag,
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
  const runPass = async (reason: string): Promise<number> => {
    const { config, configPath } = await resolveConfig(cliOptions);
    const options = resolveCliOptions(cliOptions, config);
    validateCliOptions(options);

    const result = generateOnce(options, config);
    if (result.diagnostics.length > 0) {
      logDiagnostics(result.diagnostics);
      console.error(`ziel-codegen: watch (${reason}) — generation failed`);
      return 1;
    }

    if (options.dryRun) {
      console.error(`ziel-codegen: watch (${reason}) — wrote stdout (dry-run)`);
    } else if (result.wrote) {
      console.error(`ziel-codegen: watch (${reason}) — wrote ${resolve(options.out!)}`);
    } else {
      console.error(`ziel-codegen: watch (${reason}) — unchanged ${resolve(options.out!)}`);
    }
    return 0;
  };

  // Initial pass before arming watchers.
  const initial = await runPass("initial");

  const { config, configPath } = await resolveConfig(cliOptions);
  const options = resolveCliOptions(cliOptions, config);
  const root = resolve(options.root ?? process.cwd());
  const outPath = options.dryRun || !options.out ? undefined : resolve(options.out);

  console.error(`ziel-codegen: watching ${root} for .ziel changes (Ctrl+C to stop)`);

  const dispose = watchCodegenInputs({
    root,
    configPath,
    outPath,
    onChange: async (reason) => {
      await runPass(reason);
    },
  });

  try {
    await waitForSignal();
  } finally {
    dispose();
  }

  return initial;
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
