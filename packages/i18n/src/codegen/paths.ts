import path from "node:path";
import type { ImportExtension } from "./types.js";
import { SUPPORTED_IMPORT_EXTENSIONS } from "./constants.js";
import { CodegenConfig } from "./codegen-config-schema.js";

export const GENERATED_FILE_BANNER = "// Automatically generated code. Do not edit manually.\n";
export const DEFAULT_IMPORT_EXTENSION: ImportExtension = "none";

export function reportCodegenIssues(issues: readonly { message: string }[]): void {
  for (const issue of issues) {
    console.error(`[Codegen Error] ${issue.message}`);
  }
}

export function toImportPath(fromFile: string, toFile: string): string {
  const relative = path.relative(path.dirname(fromFile), toFile).replace(/\\/g, "/");
  const withoutExt = relative.replace(/\.(json|ya?ml)$/i, "");
  return withoutExt.startsWith(".") ? withoutExt : `./${withoutExt}`;
}

export function toModuleBasename(filePath: string): string {
  return path.basename(filePath).replace(/\.ts$/, "");
}

export function resolveImportExtension(
  config: Pick<CodegenConfig, "importExtension">
): ImportExtension {
  const extension = config.importExtension ?? DEFAULT_IMPORT_EXTENSION;
  if (!SUPPORTED_IMPORT_EXTENSIONS.includes(extension)) {
    throw new Error(
      `[Codegen Error] importExtension must be "none", ".ts", or ".js", got ${JSON.stringify(extension)}.`
    );
  }
  return extension;
}

export function importExtensionSuffix(importExtension: ImportExtension): string {
  return importExtension === "none" ? "" : importExtension;
}

export function toRelativeModuleImport(
  moduleBasename: string,
  importExtension: ImportExtension
): string {
  return `./${moduleBasename}${importExtensionSuffix(importExtension)}`;
}

export function toImportIdentifier(namespace: string): string {
  const safe = namespace.replace(/[^a-zA-Z0-9_$]/g, "_");
  if (/^[0-9]/.test(safe)) {
    return `ns_${safe}`;
  }
  return `${safe}Ns`;
}

export function toLocaleObjectKey(locale: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(locale) ? locale : JSON.stringify(locale);
}
