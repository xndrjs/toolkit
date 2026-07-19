import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "@xndrjs/i18n/codegen";
import type { CodegenConfig } from "@xndrjs/i18n/codegen";
import { resolveCodegenPaths } from "@xndrjs/i18n/codegen";
import {
  formatReactBindingsFile,
  toModuleBasename,
  toRelativeModuleImport,
} from "./emit/react-bindings-file.js";
import {
  defaultReactConfigPath,
  loadReactCodegenConfig,
  resolveReactBindingsOutputPath,
} from "./react-codegen-config.js";
import { writeFileIfChanged } from "./write-file-if-changed.js";

function readCliFlag(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return undefined;
  }
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new Error(`[i18n-react Codegen Error] Missing value for ${flag}`);
  }
  return value;
}

/**
 * React bindings codegen CLI.
 *
 * Reads `i18n.codegen.json` from `@xndrjs/i18n` and optionally `i18n-react.codegen.json`.
 * Output path: `--out` > react config `output` > default next to instance under `output/`.
 */
function main(): void {
  const configPath = path.resolve(
    process.cwd(),
    readCliFlag("--config") ?? "i18n/i18n.codegen.json"
  );
  const projectRoot = path.dirname(configPath);

  if (!fs.existsSync(configPath)) {
    throw new Error(`[i18n-react Codegen Error] Config file not found: ${configPath}`);
  }

  const config: CodegenConfig = loadConfig(configPath);
  const paths = resolveCodegenPaths(config);

  const instanceImport = toRelativeModuleImport(toModuleBasename(paths.instanceOutput), "none");
  const typesImport = toRelativeModuleImport(toModuleBasename(paths.typesOutput), "none");

  const reactConfigPath = path.resolve(
    projectRoot,
    readCliFlag("--react-config") ?? defaultReactConfigPath(configPath)
  );
  const reactConfig = loadReactCodegenConfig(reactConfigPath);
  const cliOut = readCliFlag("--out");
  const reactOutputRelative = resolveReactBindingsOutputPath({
    instanceOutput: paths.instanceOutput,
    ...(cliOut ? { cliOut } : {}),
    reactConfig,
  });
  const reactOutputPath = path.resolve(projectRoot, reactOutputRelative);

  const content = formatReactBindingsFile({
    factoryName: paths.factoryName,
    paramsTypeName: paths.paramsTypeName,
    schemaTypeName: paths.schemaTypeName,
    localeTypeName: paths.localeTypeName,
    instanceImport,
    typesImport,
    loaderStrategy: config.loaderStrategy ?? "import",
  });

  const written = writeFileIfChanged(reactOutputPath, content);
  const displayPath = path.relative(projectRoot, reactOutputPath);

  if (written) {
    console.log(`[i18n-react Codegen] Wrote ${displayPath}`);
  } else {
    console.log(`[i18n-react Codegen] Unchanged ${displayPath}`);
  }
}

main();
