import fs from "node:fs";
import type { VariableSpec } from "../icu/extract-variables.js";
import type { DictionarySpec } from "../validation/types.js";
import type { NamespaceEntry } from "./types.js";

/** Builds a multi-mode {@link DictionarySpec} from ICU analysis for the given entries. */
export function buildDictionarySpecFromAnalysis(
  entries: NamespaceEntry[],
  argsSpecByNamespace: Record<string, Record<string, VariableSpec>>
): Extract<DictionarySpec, { mode: "multi" }> {
  const requiredKeys: Record<string, readonly string[]> = {};
  const argsByKey: Record<string, Record<string, VariableSpec>> = {};

  for (const entry of entries) {
    const argsByKeyForNs = argsSpecByNamespace[entry.namespace] ?? {};
    requiredKeys[entry.namespace] = Object.keys(argsByKeyForNs).sort();
    argsByKey[entry.namespace] = argsByKeyForNs;
  }

  return {
    mode: "multi",
    requiredKeys,
    argsByKey,
  };
}

/**
 * Loads `DICTIONARY_SPEC` from a previously generated `dictionary-schema.generated.ts`.
 * Sync parse of the emitter format from {@link formatDictionarySpecBlock} (no TS runtime import).
 */
export function loadDictionarySpecFromSchemaFile(
  absoluteSchemaPath: string
): Extract<DictionarySpec, { mode: "multi" }> {
  if (!fs.existsSync(absoluteSchemaPath)) {
    throw new Error(
      `[Codegen Error] Missing dictionary schema at ${absoluteSchemaPath}. Run runCodegen first.`
    );
  }

  const source = fs.readFileSync(absoluteSchemaPath, "utf8");
  const match = source.match(
    /export const DICTIONARY_SPEC = (\{[\s\S]*?\n\}) satisfies DictionarySpec;/
  );
  if (!match?.[1]) {
    throw new Error(
      `[Codegen Error] Could not parse DICTIONARY_SPEC from ${absoluteSchemaPath}. Re-run runCodegen.`
    );
  }

  const cleaned = match[1].replace(/ as const/g, "");
  let parsed: unknown;
  try {
    parsed = new Function(`"use strict"; return (${cleaned});`)();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[Codegen Error] Failed to evaluate DICTIONARY_SPEC from ${absoluteSchemaPath}: ${message}`
    );
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as DictionarySpec).mode !== "multi" ||
    !("requiredKeys" in parsed) ||
    !("argsByKey" in parsed)
  ) {
    throw new Error(
      `[Codegen Error] DICTIONARY_SPEC in ${absoluteSchemaPath} is not a multi-mode DictionarySpec.`
    );
  }

  return parsed as Extract<DictionarySpec, { mode: "multi" }>;
}

function sortedKeys(keys: readonly string[]): string[] {
  return [...keys].sort();
}

function variableSpecsEqual(a: VariableSpec, b: VariableSpec): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (let i = 0; i < aKeys.length; i++) {
    const key = aKeys[i]!;
    if (key !== bKeys[i] || a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}

function namespaceArgsEqual(
  a: Readonly<Record<string, VariableSpec>> | undefined,
  b: Readonly<Record<string, VariableSpec>> | undefined
): boolean {
  const aKeys = Object.keys(a ?? {}).sort();
  const bKeys = Object.keys(b ?? {}).sort();
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (const key of aKeys) {
    if (!bKeys.includes(key)) {
      return false;
    }
    if (!variableSpecsEqual(a![key]!, b![key]!)) {
      return false;
    }
  }
  return true;
}

/**
 * Returns true when `current` matches `established` for every namespace in `namespaces`
 * (same keys + same ICU VariableSpec per key).
 */
export function namespaceContractsMatch(
  namespaces: readonly string[],
  current: Extract<DictionarySpec, { mode: "multi" }>,
  established: Extract<DictionarySpec, { mode: "multi" }>
): boolean {
  for (const namespace of namespaces) {
    const currentKeys = sortedKeys(current.requiredKeys[namespace] ?? []);
    const establishedKeys = sortedKeys(established.requiredKeys[namespace] ?? []);
    if (
      currentKeys.length !== establishedKeys.length ||
      currentKeys.some((key, index) => key !== establishedKeys[index])
    ) {
      return false;
    }
    if (!namespaceArgsEqual(current.argsByKey[namespace], established.argsByKey[namespace])) {
      return false;
    }
  }
  return true;
}
