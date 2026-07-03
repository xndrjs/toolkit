import fs from "node:fs";
import path from "node:path";
import { parse } from "@formatjs/icu-messageformat-parser";
import {
  extractVariables,
  mergeVariableSpecs,
  type VariableSpec,
} from "../icu/extract-variables.js";
import type { DictionaryJson, NamespaceEntry } from "./types.js";

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
}

export function analyzeDictionaries(
  projectRoot: string,
  entries: NamespaceEntry[]
): { ok: true; analysis: DictionaryAnalysis } | { ok: false } {
  const paramsByNamespace: Record<string, Record<string, string>> = {};
  const argsSpecByNamespace: Record<string, Record<string, VariableSpec>> = {};
  const locales = new Set<string>();
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

    const dictionary = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as DictionaryJson;
    paramsByNamespace[entry.namespace] = {};
    argsSpecByNamespace[entry.namespace] = {};

    for (const [key, localesByKey] of Object.entries(dictionary)) {
      const variables: VariableSpec = {};

      for (const locale of Object.keys(localesByKey)) {
        locales.add(locale);
      }

      for (const [locale, template] of Object.entries(localesByKey)) {
        try {
          const ast = parse(template);
          const extracted = extractVariables(ast);
          Object.assign(variables, mergeVariableSpecs(variables, extracted));
        } catch (error) {
          hasErrors = true;
          const message = error instanceof Error ? error.message : String(error);
          console.error(
            `[Codegen Error] ICU syntax error — namespace "${entry.namespace}", key "${key}", locale "${locale}": ${message}`
          );
        }
      }

      paramsByNamespace[entry.namespace]![key] = paramsTypeForVariables(variables);
      argsSpecByNamespace[entry.namespace]![key] = variables;
    }
  }

  if (hasErrors) {
    return { ok: false };
  }

  return {
    ok: true,
    analysis: { paramsByNamespace, argsSpecByNamespace, locales },
  };
}
