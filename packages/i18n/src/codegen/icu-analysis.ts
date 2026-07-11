import fs from "node:fs";
import path from "node:path";
import { parse } from "@formatjs/icu-messageformat-parser";
import {
  extractVariableMeta,
  mergeVariableMetaAcrossLocales,
  type VariableSpec,
} from "../icu/extract-variables.js";
import type { DictionaryJson, NamespaceEntry } from "./types.js";
import { readDictionaryFile } from "./read-dictionary.js";

export function paramsTypeForVariables(variables: VariableSpec): string {
  const keys = Object.keys(variables);
  if (keys.length === 0) {
    return "never";
  }

  const props = keys.map((key) => {
    const type = variables[key] === "date" ? "Date | number" : variables[key];
    return `${key}: ${type}`;
  });
  return `{ ${props.join("; ")} }`;
}

export interface DictionaryAnalysis {
  paramsByNamespace: Record<string, Record<string, string>>;
  argsSpecByNamespace: Record<string, Record<string, VariableSpec>>;
  locales: Set<string>;
  dictionariesByNamespace: Record<string, DictionaryJson>;
}

/**
 * Phase 1 of codegen: read source dictionaries, validate ICU syntax, infer param types.
 * Output feeds type emission, optional `DICTIONARY_SPEC`, and `prepareDictionaryEntries`.
 */
export function analyzeDictionaries(
  projectRoot: string,
  entries: NamespaceEntry[]
): { ok: true; analysis: DictionaryAnalysis } | { ok: false } {
  const paramsByNamespace: Record<string, Record<string, string>> = {};
  const argsSpecByNamespace: Record<string, Record<string, VariableSpec>> = {};
  const locales = new Set<string>();
  const dictionariesByNamespace: Record<string, DictionaryJson> = {};
  let hasErrors = false;

  for (const entry of entries) {
    const absolutePath = path.resolve(projectRoot, entry.filePath);

    if (!fs.existsSync(absolutePath)) {
      console.error(
        `[Codegen Error] Dictionary file not found for namespace "${entry.namespace}": ${absolutePath}`
      );
      hasErrors = true;
      continue;
    }

    const dictionary = readDictionaryFile(absolutePath);
    dictionariesByNamespace[entry.namespace] = dictionary;
    paramsByNamespace[entry.namespace] = {};
    argsSpecByNamespace[entry.namespace] = {};

    for (const [key, localesByKey] of Object.entries(dictionary)) {
      const localeMetas: ReturnType<typeof extractVariableMeta>[] = [];

      for (const locale of Object.keys(localesByKey)) {
        locales.add(locale);
      }

      for (const [locale, template] of Object.entries(localesByKey)) {
        try {
          const ast = parse(template);
          localeMetas.push(extractVariableMeta(ast));
        } catch (error) {
          hasErrors = true;
          const message = error instanceof Error ? error.message : String(error);
          console.error(
            `[Codegen Error] ICU syntax error — namespace "${entry.namespace}", key "${key}", locale "${locale}": ${message}`
          );
        }
      }

      if (localeMetas.length === 0) {
        continue;
      }

      const mergedVariables = mergeVariableMetaAcrossLocales(localeMetas);
      if (!mergedVariables.ok) {
        hasErrors = true;
        console.error(
          `[Codegen Error] ${mergedVariables.message} — namespace "${entry.namespace}", key "${key}"`
        );
        continue;
      }

      const variables = mergedVariables.merged;

      paramsByNamespace[entry.namespace]![key] = paramsTypeForVariables(variables);
      argsSpecByNamespace[entry.namespace]![key] = variables;
    }
  }

  if (hasErrors) {
    return { ok: false };
  }

  return {
    ok: true,
    analysis: { paramsByNamespace, argsSpecByNamespace, locales, dictionariesByNamespace },
  };
}
