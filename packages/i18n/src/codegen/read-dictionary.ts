import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { IDENTIFIER_NAME_PATTERN, IDENTIFIER_NAME_REQUIREMENT } from "./constants.js";
import type { DeliveryMode } from "./codegen-config-schema.js";
import type { DeliveryArtifactsMap } from "./delivery-artifacts.js";
import {
  projectNamespaceForDeliveryAreaCore,
  projectNamespaceLocalesCore,
} from "../project-locales.js";
import type { LocaleFallbackMap } from "../types.js";
import type { DictionaryJson, NamespaceEntry } from "./types.js";
import { writeFileIfChanged } from "./write-file-if-changed.js";

/**
 * Dictionary I/O for codegen and audit: read/validate source files (`readDictionaryFile`)
 * and write compiled or split JSON artifacts (`prepareDictionaryEntries`).
 */
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

export function resolveSplitJsonPath(
  sourcePath: string,
  locale: string,
  generatedDirRelative: string
): string {
  const baseName = path.basename(sourcePath, path.extname(sourcePath));
  return path
    .join(generatedDirRelative, "translations", `${baseName}.${locale}.json`)
    .replace(/\\/g, "/");
}

export function resolveAreaJsonPath(
  sourcePath: string,
  area: string,
  generatedDirRelative: string
): string {
  const baseName = path.basename(sourcePath, path.extname(sourcePath));
  return path
    .join(generatedDirRelative, "translations", `${baseName}.${area}.json`)
    .replace(/\\/g, "/");
}

/** Projects a canonical dictionary into per-locale slices for split-by-locale delivery. */
export function splitDictionaryByLocale(
  dictionary: DictionaryJson,
  locales: readonly string[],
  localeFallback?: LocaleFallbackMap
): Record<string, DictionaryJson> {
  const byLocale: Record<string, DictionaryJson> = {};

  for (const locale of locales) {
    byLocale[locale] = projectNamespaceLocalesCore(dictionary, [locale], localeFallback);
  }

  return byLocale;
}

/** Projects a canonical dictionary into per-area slices for custom delivery. */
export function splitDictionaryByDeliveryArea(
  dictionary: DictionaryJson,
  deliveryArtifacts: DeliveryArtifactsMap,
  localeFallback?: LocaleFallbackMap
): Record<string, DictionaryJson> {
  const byArea: Record<string, DictionaryJson> = {};

  for (const [area, areaLocales] of Object.entries(deliveryArtifacts)) {
    byArea[area] = projectNamespaceForDeliveryAreaCore(dictionary, areaLocales, localeFallback);
  }

  return byArea;
}

function assertDictionaryShape(value: unknown, context: string): asserts value is DictionaryJson {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`[Codegen Error] ${context} must be a plain object.`);
  }

  for (const [key, localesByKey] of Object.entries(value)) {
    if (!IDENTIFIER_NAME_PATTERN.test(key)) {
      throw new Error(
        `[Codegen Error] ${context}: invalid key "${key}" (${IDENTIFIER_NAME_REQUIREMENT}).`
      );
    }

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

/** Reads and shape-validates a dictionary file from disk (JSON or YAML). */
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
  return writeFileIfChanged(absoluteJsonPath, `${JSON.stringify(dictionary, null, 2)}\n`);
}

export interface PrepareDictionaryEntriesOptions {
  dictionariesByNamespace: Record<string, DictionaryJson>;
  delivery?: DeliveryMode;
  localeFallback?: LocaleFallbackMap | undefined;
  requestLocales?: readonly string[] | undefined;
  deliveryArtifacts?: DeliveryArtifactsMap | undefined;
}

export interface PrepareDictionariesResult {
  resolvedEntries: NamespaceEntry[];
  splitPathsByNamespace: Record<string, Record<string, string>>;
  compiledFiles: string[];
}

/**
 * Phase 2 of codegen: materialize JSON artifacts on disk (YAML compile, locale/area split).
 * Returns `splitPathsByNamespace` consumed by dictionary and namespace-loader emitters.
 */
export function prepareDictionaryEntries(
  projectRoot: string,
  entries: NamespaceEntry[],
  generatedDirRelative: string,
  options: PrepareDictionaryEntriesOptions
): PrepareDictionariesResult {
  const delivery = options.delivery ?? "canonical";
  const { dictionariesByNamespace, localeFallback, requestLocales, deliveryArtifacts } = options;
  const resolvedEntries: NamespaceEntry[] = [];
  const splitPathsByNamespace: Record<string, Record<string, string>> = {};
  const compiledFiles: string[] = [];

  if (delivery === "split-by-locale" && (!requestLocales || requestLocales.length === 0)) {
    throw new Error(
      "[Codegen Error] split-by-locale delivery requires at least one request locale."
    );
  }

  if (
    delivery === "custom" &&
    (!deliveryArtifacts || Object.keys(deliveryArtifacts).length === 0)
  ) {
    throw new Error("[Codegen Error] custom delivery requires deliveryArtifacts.");
  }

  for (const entry of entries) {
    const sourceAbsolutePath = path.resolve(projectRoot, entry.filePath);
    const format = getDictionaryFormat(entry.filePath);

    if (!format) {
      throw new Error(
        `[Codegen Error] Namespace "${entry.namespace}" uses unsupported dictionary extension in "${entry.filePath}". Use .json, .yaml, or .yml.`
      );
    }

    const dictionary = dictionariesByNamespace[entry.namespace];
    if (!dictionary) {
      throw new Error(
        `[Codegen Error] Missing parsed dictionary for namespace "${entry.namespace}".`
      );
    }

    if (delivery === "split-by-locale") {
      const splitPaths: Record<string, string> = {};
      const dictionariesByLocale = splitDictionaryByLocale(
        dictionary,
        requestLocales!,
        localeFallback
      );

      for (const locale of requestLocales!) {
        const splitRelativePath = resolveSplitJsonPath(
          entry.filePath,
          locale,
          generatedDirRelative
        );
        const splitAbsolutePath = path.resolve(projectRoot, splitRelativePath);
        const wroteFile = writeCompiledJson(splitAbsolutePath, dictionariesByLocale[locale]!);

        if (wroteFile) {
          compiledFiles.push(
            `${path.relative(projectRoot, sourceAbsolutePath)} → ${splitRelativePath}`
          );
        }

        splitPaths[locale] = splitRelativePath;
      }

      splitPathsByNamespace[entry.namespace] = splitPaths;
      resolvedEntries.push(entry);
      continue;
    }

    if (delivery === "custom") {
      const splitPaths: Record<string, string> = {};
      const dictionariesByArea = splitDictionaryByDeliveryArea(
        dictionary,
        deliveryArtifacts!,
        localeFallback
      );

      for (const area of Object.keys(deliveryArtifacts!).sort()) {
        const areaRelativePath = resolveAreaJsonPath(entry.filePath, area, generatedDirRelative);
        const areaAbsolutePath = path.resolve(projectRoot, areaRelativePath);
        const wroteFile = writeCompiledJson(areaAbsolutePath, dictionariesByArea[area]!);

        if (wroteFile) {
          compiledFiles.push(
            `${path.relative(projectRoot, sourceAbsolutePath)} → ${areaRelativePath}`
          );
        }

        splitPaths[area] = areaRelativePath;
      }

      splitPathsByNamespace[entry.namespace] = splitPaths;
      resolvedEntries.push(entry);
      continue;
    }

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

  return { resolvedEntries, splitPathsByNamespace, compiledFiles };
}
