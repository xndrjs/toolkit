import fs from "node:fs";
import path from "node:path";
import type { CodegenConfig } from "../codegen/codegen-config-schema.js";
import { loadConfig } from "../codegen/config.js";
import { type FailOnCriterion, runAuditFromConfig } from "./audit-dictionaries.js";

const FAIL_ON_VALUES = new Set<FailOnCriterion>(["effective", "direct", "any"]);

export interface AuditCliOptions {
  configPath: string;
  outPath?: string;
  failOn?: FailOnCriterion;
  treatEmptyAsMissing: boolean;
}

export function parseAuditArgs(argv: string[]): AuditCliOptions {
  const configArgIndex = argv.indexOf("--config");
  const outArgIndex = argv.indexOf("--out");
  const failOnArgIndex = argv.indexOf("--fail-on");

  const configPath = path.resolve(
    process.cwd(),
    configArgIndex >= 0 ? argv[configArgIndex + 1]! : "i18n/i18n.codegen.json"
  );

  const outPath =
    outArgIndex >= 0 ? path.resolve(process.cwd(), argv[outArgIndex + 1]!) : undefined;

  let failOn: FailOnCriterion | undefined;
  if (failOnArgIndex >= 0) {
    const value = argv[failOnArgIndex + 1];
    if (!value || !FAIL_ON_VALUES.has(value as FailOnCriterion)) {
      throw new Error(`[Audit Error] --fail-on must be one of: effective, direct, any`);
    }
    failOn = value as FailOnCriterion;
  }

  const treatEmptyAsMissing = !argv.includes("--allow-empty");

  return {
    configPath,
    treatEmptyAsMissing,
    ...(outPath !== undefined ? { outPath } : {}),
    ...(failOn !== undefined ? { failOn } : {}),
  };
}

export async function runAuditCli(argv = process.argv.slice(2)): Promise<number> {
  let options: AuditCliOptions;
  let config: CodegenConfig;

  try {
    options = parseAuditArgs(argv);

    if (!fs.existsSync(options.configPath)) {
      console.error(`[Audit Error] Config file not found: ${options.configPath}`);
      return 2;
    }

    config = loadConfig(options.configPath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }

  const projectRoot = path.dirname(options.configPath);

  const { report, exitCode } = await runAuditFromConfig({
    projectRoot,
    config,
    treatEmptyAsMissing: options.treatEmptyAsMissing,
    ...(options.failOn !== undefined ? { failOn: options.failOn } : {}),
  });

  const json = `${JSON.stringify(report, null, 2)}\n`;

  if (options.outPath) {
    fs.mkdirSync(path.dirname(options.outPath), { recursive: true });
    fs.writeFileSync(options.outPath, json);
  } else {
    process.stdout.write(json);
  }

  return exitCode;
}

async function main(): Promise<void> {
  const exitCode = await runAuditCli();
  process.exit(exitCode);
}

if (process.argv[1]?.endsWith("run-audit.ts")) {
  void main();
}
