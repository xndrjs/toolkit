import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { DictionaryJson, NamespaceEntry } from "./types.js";

export const SUPPORTED_DICTIONARY_EXTENSIONS = [".json", ".yaml", ".yml"] as const;
export type DictionaryFormat = "json" | "yaml";

export function getDictionaryFormat(filePath: string): DictionaryFormat | null {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".json") {
    return "json";
  }
  if (extension === ".yaml" || extension === ".yml") {
    return "yaml";
  }
  return null;
}

export function resolveCompiledJsonPath(sourcePath: string, generatedDirRelative: string): string {
  const baseName = `${path.basename(sourcePath, path.extname(sourcePath))}.json`;
  return path.join(generatedDirRelative, "translations", baseName).replace(/\\/g, "/");
}

function assertDictionaryShape(value: unknown, context: string): asserts value is DictionaryJson {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`[Codegen Error] ${context} must be a plain object.`);
  }

  for (const [key, localesByKey] of Object.entries(value)) {
    if (localesByKey === null || typeof localesByKey !== "object" || Array.isArray(localesByKey)) {
      throw new Error(`[Codegen Error] ${context}: key "${key}" must map locales to strings.`);
    }

    for (const [locale, template] of Object.entries(localesByKey)) {
      if (typeof template !== "string") {
        throw new Error(
          `[Codegen Error] ${context}: key "${key}", locale "${locale}" must be a string.`
        );
      }
    }
  }
}

export function readDictionaryFile(absolutePath: string): DictionaryJson {
  const format = getDictionaryFormat(absolutePath);
  if (!format) {
    throw new Error(
      `[Codegen Error] Unsupported dictionary format "${path.extname(absolutePath)}" for ${absolutePath}. Use .json, .yaml, or .yml.`
    );
  }

  const source = fs.readFileSync(absolutePath, "utf8");
  let parsed: unknown;

  try {
    parsed = format === "json" ? JSON.parse(source) : parseYaml(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[Codegen Error] Failed to parse dictionary ${absolutePath}: ${message}`);
  }

  assertDictionaryShape(parsed, `Dictionary file ${absolutePath}`);
  return parsed;
}

function writeCompiledJson(absoluteJsonPath: string, dictionary: DictionaryJson): boolean {
  const nextContent = `${JSON.stringify(dictionary, null, 2)}\n`;
  if (fs.existsSync(absoluteJsonPath)) {
    const currentContent = fs.readFileSync(absoluteJsonPath, "utf8");
    if (currentContent === nextContent) {
      return false;
    }
  }

  fs.mkdirSync(path.dirname(absoluteJsonPath), { recursive: true });
  fs.writeFileSync(absoluteJsonPath, nextContent);
  return true;
}

export interface PrepareDictionariesResult {
  resolvedEntries: NamespaceEntry[];
  compiledFiles: string[];
}

export function prepareDictionaryEntries(
  projectRoot: string,
  entries: NamespaceEntry[],
  generatedDirRelative: string
): PrepareDictionariesResult {
  const resolvedEntries: NamespaceEntry[] = [];
  const compiledFiles: string[] = [];

  for (const entry of entries) {
    const sourceAbsolutePath = path.resolve(projectRoot, entry.filePath);
    const format = getDictionaryFormat(entry.filePath);

    if (!format) {
      throw new Error(
        `[Codegen Error] Namespace "${entry.namespace}" uses unsupported dictionary extension in "${entry.filePath}". Use .json, .yaml, or .yml.`
      );
    }

    if (!fs.existsSync(sourceAbsolutePath)) {
      throw new Error(
        `[Codegen Error] Dictionary file not found for namespace "${entry.namespace}": ${sourceAbsolutePath}`
      );
    }

    const dictionary = readDictionaryFile(sourceAbsolutePath);

    if (format === "yaml") {
      const compiledRelativePath = resolveCompiledJsonPath(entry.filePath, generatedDirRelative);
      const compiledAbsolutePath = path.resolve(projectRoot, compiledRelativePath);
      const wroteFile = writeCompiledJson(compiledAbsolutePath, dictionary);

      if (wroteFile) {
        compiledFiles.push(
          `${path.relative(projectRoot, sourceAbsolutePath)} → ${compiledRelativePath}`
        );
      }
      resolvedEntries.push({
        namespace: entry.namespace,
        filePath: compiledRelativePath,
      });
      continue;
    }

    resolvedEntries.push(entry);
  }

  return { resolvedEntries, compiledFiles };
}
