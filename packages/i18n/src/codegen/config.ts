import fs from "node:fs";
import type { NamespaceEntry } from "./types.js";
import {
  CodegenConfig,
  codegenConfigSchema,
  formatCodegenConfigIssues,
} from "./codegen-config-schema.js";

export {
  resolveCodegenPaths,
  resolveArtifactsPath,
  GENERATED_BASENAMES,
  DEFAULT_FACTORY_NAME,
  DEFAULT_LOCALE_FALLBACK_CONST_NAME,
} from "./codegen-config-schema.js";

/** Parses and validates `i18n.codegen.json`; first step of the codegen pipeline. */
export function loadConfig(configPath: string): CodegenConfig {
  let raw: unknown;

  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[Codegen Error] Failed to parse config JSON (${configPath}): ${message}`);
  }

  const result = codegenConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(formatCodegenConfigIssues(result.error));
  }

  return result.data;
}

/** Maps config namespaces to namespace entries. */
export function resolveNamespaces(config: CodegenConfig): NamespaceEntry[] {
  return Object.entries(config.namespaces).map(([namespace, filePath]) => ({
    namespace,
    filePath,
  }));
}
