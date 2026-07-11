import { mergeVariableMetaAcrossLocales, type VariableMetaSpec } from "../icu/extract-variables.js";
import { parseTemplate } from "../icu/parse-template.js";
import type {
  DictionarySpec,
  NormalizedDictionary,
  NormalizedKeyDictionary,
  ParsedKeyEntry,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

function failure(issues: ValidationIssue[]): ValidationResult<NormalizedDictionary> {
  return { ok: false, issues };
}

function success(data: NormalizedDictionary): ValidationResult<NormalizedDictionary> {
  return { ok: true, data };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKeyDictionary(
  input: Record<string, unknown>,
  requiredKeys: readonly string[],
  keyPathPrefix: readonly string[]
): ValidationResult<NormalizedKeyDictionary> {
  const issues: ValidationIssue[] = [];
  const keys: Record<string, ParsedKeyEntry> = {};

  for (const key of requiredKeys) {
    if (!(key in input)) {
      issues.push({ kind: "missing_key", path: [...keyPathPrefix, key] });
      continue;
    }

    const keyValue = input[key];
    if (!isPlainObject(keyValue)) {
      issues.push({
        kind: "invalid_input",
        message: `Expected object for key "${key}", got ${typeof keyValue}`,
      });
      continue;
    }

    const locales: Record<string, ParsedKeyEntry["locales"][string]> = {};
    const localeMetas: VariableMetaSpec[] = [];
    let mergedArgs: ParsedKeyEntry["mergedArgs"] = {};
    let localeArgsMismatch: ValidationIssue | undefined;

    for (const [locale, template] of Object.entries(keyValue)) {
      const localePath = [...keyPathPrefix, key, locale];

      if (typeof template !== "string") {
        issues.push({
          kind: "invalid_locale_value",
          path: localePath,
          message: `expected string, got ${typeof template}`,
        });
        continue;
      }

      const parsed = parseTemplate(template);
      if (!parsed.ok) {
        issues.push({
          kind: "icu_syntax_error",
          path: localePath,
          message: parsed.message,
        });
        continue;
      }

      locales[locale] = { template, args: parsed.args };
      localeMetas.push(parsed.meta);
    }

    if (localeMetas.length > 0) {
      const merged = mergeVariableMetaAcrossLocales(localeMetas);
      if (!merged.ok) {
        const localeArgs: Record<string, ParsedKeyEntry["mergedArgs"]> = {};
        for (const [loc, entry] of Object.entries(locales)) {
          localeArgs[loc] = entry.args;
        }
        localeArgsMismatch = {
          kind: "locale_args_mismatch",
          path: [...keyPathPrefix, key],
          locales: localeArgs,
          message: merged.message,
        };
      } else {
        mergedArgs = merged.merged;
      }
    }

    if (localeArgsMismatch) {
      issues.push(localeArgsMismatch);
    }

    keys[key] = { locales, mergedArgs };
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, data: keys };
}

/**
 * Validation step 1: coerce external input into a normalized dictionary shape
 * (keys, locales, ICU args) against a `DictionarySpec`.
 */
export function normalizeDictionary(
  input: unknown,
  spec: DictionarySpec
): ValidationResult<NormalizedDictionary> {
  if (!isPlainObject(input)) {
    return failure([
      {
        kind: "invalid_input",
        message: `Expected object, got ${input === null ? "null" : typeof input}`,
      },
    ]);
  }

  if (spec.mode === "single") {
    const result = normalizeKeyDictionary(input, spec.requiredKeys, []);
    if (!result.ok) {
      return result;
    }

    return success({ mode: "single", keys: result.data });
  }

  const issues: ValidationIssue[] = [];
  const namespaces: Record<string, NormalizedKeyDictionary> = {};

  for (const [namespace, requiredKeys] of Object.entries(spec.requiredKeys)) {
    if (!(namespace in input)) {
      for (const key of requiredKeys) {
        issues.push({ kind: "missing_key", path: [namespace, key] });
      }
      continue;
    }

    const namespaceValue = input[namespace];
    if (!isPlainObject(namespaceValue)) {
      issues.push({
        kind: "invalid_input",
        message: `Expected object for namespace "${namespace}", got ${typeof namespaceValue}`,
      });
      continue;
    }

    const result = normalizeKeyDictionary(namespaceValue, requiredKeys, [namespace]);
    if (!result.ok) {
      issues.push(...result.issues);
    } else {
      namespaces[namespace] = result.data;
    }
  }

  if (issues.length > 0) {
    return failure(issues);
  }

  return success({ mode: "multi", namespaces });
}
