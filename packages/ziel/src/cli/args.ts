import { parseArgs } from "node:util";

import type { ZielCodegenConfig } from "../compile/config/define-config";

export type CliOptions = {
  configPath: string | undefined;
  out: string | undefined;
  root: string | undefined;
  dryRun: boolean;
  help: boolean;
};

export type ResolvedCliOptions = CliOptions;

function hasConfigValue(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : value !== undefined;
}

function warnDuplicate(cliFlag: string, configPath: string): void {
  console.warn(`ziel-codegen: ${cliFlag} overrides ${configPath} from ziel config.`);
}

function preferCli<T>(
  cliValue: T | undefined,
  configValue: T | undefined,
  cliFlag: string,
  configPath: string
): T | undefined {
  if (hasConfigValue(cliValue) && hasConfigValue(configValue)) {
    warnDuplicate(cliFlag, configPath);
  }

  return hasConfigValue(cliValue) ? cliValue : configValue;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      config: { type: "string" },
      out: { type: "string" },
      root: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  return {
    configPath: values.config,
    out: values.out,
    root: values.root,
    dryRun: values["dry-run"] ?? false,
    help: values.help ?? false,
  };
}

export function printCliHelp(): void {
  console.log(`ziel-codegen — generate TypeScript resources from .ziel files

Usage:
  ziel-codegen --config ./ziel.config.ts
  ziel-codegen --config ./ziel.config.ts --dry-run
  ziel-codegen --out ./src/generated/resources.ts --dry-run

Options:
  --config <path>   Path to ziel.config.ts (default: ./ziel.config.ts when present)
  --out <path>      Output TypeScript file (required unless --dry-run; can be set in config)
  --root <path>     Root directory for globs (default: process.cwd(); can be set in config)
  --dry-run         Print generated source to stdout instead of writing --out
  -h, --help        Show this help
`);
}

export function resolveCliOptions(
  options: CliOptions,
  config: ZielCodegenConfig | undefined
): ResolvedCliOptions {
  return {
    ...options,
    out: preferCli(options.out, config?.out, "--out", "out"),
    root: preferCli(options.root, config?.root, "--root", "root"),
  };
}

export function validateCliOptions(options: ResolvedCliOptions): void {
  if (options.help) {
    return;
  }

  if (!options.dryRun && !options.out) {
    throw new Error("--out is required unless --dry-run is set.");
  }
}
