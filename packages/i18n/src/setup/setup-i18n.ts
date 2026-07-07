import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_IMPORT_EXTENSION, importExtensionSuffix } from "../codegen/paths.js";
import { inferProjectName, typeNamesForProject } from "./type-names.js";

export type SetupMode = "single" | "multi";

export interface SetupOptions {
  mode: SetupMode;
  targetDir: string;
  project?: string | undefined;
  force?: boolean | undefined;
}

export interface SetupResult {
  targetDir: string;
  project: string;
  created: string[];
}

const I18N_ROOT = "i18n";
const CONFIG_FILE = `${I18N_ROOT}/i18n.codegen.json`;
/** Paths in i18n.codegen.json are relative to the i18n/ folder */
const GENERATED_DIR = "generated";
const TRANSLATIONS_DIR = "translations";

const DEFAULT_STARTER = {
  welcome: { en: "Welcome {name}!" },
};

const DEFAULT_IMPORT_SUFFIX = importExtensionSuffix(DEFAULT_IMPORT_EXTENSION);

const INDEX_TS =
  `import { createI18n } from "./generated/instance.generated${DEFAULT_IMPORT_SUFFIX}";\n\n` +
  `export * from "./generated/instance.generated${DEFAULT_IMPORT_SUFFIX}";\n` +
  `export * from "./generated/dictionary.generated${DEFAULT_IMPORT_SUFFIX}";\n` +
  `export * from "./generated/i18n-types.generated${DEFAULT_IMPORT_SUFFIX}";\n\n` +
  `export const i18n = createI18n();\n`;

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function relative(fromRoot: string, filePath: string): string {
  return path.relative(fromRoot, filePath).replace(/\\/g, "/");
}

export function buildCodegenConfig(mode: SetupMode, project: string): Record<string, unknown> {
  const typeNames = typeNamesForProject(project);
  const base = {
    typesOutput: `${GENERATED_DIR}/i18n-types.generated.ts`,
    dictionaryOutput: `${GENERATED_DIR}/dictionary.generated.ts`,
    instanceOutput: `${GENERATED_DIR}/instance.generated.ts`,
    paramsTypeName: typeNames.paramsTypeName,
    schemaTypeName: typeNames.schemaTypeName,
    localeTypeName: typeNames.localeTypeName,
    factoryName: "createI18n",
  };

  if (mode === "single") {
    return {
      dictionary: `${TRANSLATIONS_DIR}/translations.json`,
      ...base,
    };
  }

  return {
    namespaces: {
      default: `${TRANSLATIONS_DIR}/default.json`,
    },
    ...base,
  };
}

export function runSetup(options: SetupOptions): SetupResult {
  const targetDir = path.resolve(options.targetDir);
  const project =
    options.project ?? inferProjectName(path.basename(targetDir.replace(/[/\\]$/, "") || "app"));

  if (!/^[A-Z][a-zA-Z0-9]*$/.test(project)) {
    throw new Error(
      `[Setup Error] Invalid project name "${project}". Use PascalCase (e.g. MyApp) via --project.`
    );
  }

  const configPath = path.join(targetDir, CONFIG_FILE);
  if (fs.existsSync(configPath) && !options.force) {
    throw new Error(
      `[Setup Error] ${relative(process.cwd(), configPath)} already exists. Use --force to overwrite.`
    );
  }

  const created: string[] = [];

  writeJson(configPath, buildCodegenConfig(options.mode, project));
  created.push(relative(targetDir, configPath));

  if (options.mode === "single") {
    const translationsPath = path.join(targetDir, I18N_ROOT, TRANSLATIONS_DIR, "translations.json");
    writeJson(translationsPath, DEFAULT_STARTER);
    created.push(relative(targetDir, translationsPath));
  } else {
    const defaultPath = path.join(targetDir, I18N_ROOT, TRANSLATIONS_DIR, "default.json");
    writeJson(defaultPath, DEFAULT_STARTER);
    created.push(relative(targetDir, defaultPath));
  }

  const indexPath = path.join(targetDir, I18N_ROOT, "index.ts");
  writeText(indexPath, INDEX_TS);
  created.push(relative(targetDir, indexPath));

  fs.mkdirSync(path.join(targetDir, I18N_ROOT, GENERATED_DIR), { recursive: true });

  return { targetDir, project, created };
}

export function parseSetupArgs(argv: string[]): SetupOptions {
  const mode = argv[0];
  if (mode !== "single" && mode !== "multi") {
    throw new Error(
      `[Setup Error] Usage: xndrjs-i18n-setup <single|multi> [targetDir] [--project MyApp] [--force]`
    );
  }

  let targetDir = ".";
  let project: string | undefined;
  let force = false;

  for (let index = 1; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === "--project") {
      project = argv[++index];
      if (!project) {
        throw new Error("[Setup Error] --project requires a value.");
      }
      continue;
    }
    if (arg === "--force") {
      force = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`[Setup Error] Unknown flag: ${arg}`);
    }
    targetDir = arg;
  }

  return { mode, targetDir, project, force };
}

function main() {
  try {
    const options = parseSetupArgs(process.argv.slice(2));
    const result = runSetup(options);

    console.log(`✅ Setup ${options.mode} i18n in ${result.targetDir}`);
    console.log(
      `   Project types: ${result.project}Params, ${result.project}Schema, ${result.project}Locale`
    );
    console.log(`   Created: ${result.created.join(", ")}`);
    const targetLabel = path.relative(process.cwd(), result.targetDir) || ".";

    console.log("");
    console.log(`Add to package.json scripts (from ${targetLabel}):`);
    console.log(`  "i18n:codegen": "xndrjs-i18n-codegen --config ${CONFIG_FILE}"`);
    console.log("");
    console.log("Then run your package manager's run script (pnpm/npm/yarn).");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
