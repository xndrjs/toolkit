import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { Diagnostic } from "../check";
import { buildResources } from "../compile/codegen/build-resources";
import type { NaviQlCodegenConfig } from "../compile/config/define-config";
import {
  parseCliArgs,
  printCliHelp,
  resolveCliOptions,
  validateCliOptions,
  type CliOptions,
} from "./args";
import { loadConfigFile } from "./load-config";

/** Default config filename looked up in cwd when `--config` is omitted. */
export const DEFAULT_CONFIG_PATH = "naviql.config.ts";

function formatDiagnostic(diagnostic: Diagnostic): string {
  const loc = diagnostic.path ? ` at ${diagnostic.path}` : "";
  return `naviql-codegen: ${diagnostic.code}: ${diagnostic.message}${loc}`;
}

async function resolveConfig(cliOptions: CliOptions): Promise<NaviQlCodegenConfig | undefined> {
  const configPath = cliOptions.configPath ?? DEFAULT_CONFIG_PATH;
  const absolute = resolve(configPath);

  if (!existsSync(absolute)) {
    if (cliOptions.configPath) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    return undefined;
  }

  return loadConfigFile(configPath);
}

export async function runCli(argv: string[]): Promise<number> {
  const cliOptions = parseCliArgs(argv);

  if (cliOptions.help) {
    printCliHelp();
    return 0;
  }

  const config = await resolveConfig(cliOptions);
  const options = resolveCliOptions(cliOptions, config);
  validateCliOptions(options);

  const { code, diagnostics } = buildResources({
    root: options.root,
    include: config?.include,
    exclude: config?.exclude,
    pathFilter: config?.pathFilter,
    importFrom: config?.importFrom,
    registryTypeName: config?.registryTypeName,
  });

  if (diagnostics.length > 0) {
    for (const diagnostic of diagnostics) {
      console.error(formatDiagnostic(diagnostic));
    }
    return 1;
  }

  if (options.dryRun) {
    process.stdout.write(code);
    return 0;
  }

  const outPath = resolve(options.out!);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, code, "utf8");
  return 0;
}
