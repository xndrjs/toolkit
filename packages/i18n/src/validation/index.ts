import { normalizeDictionaryPartial, normalizeKeyDictionaryPartial } from "./normalize.js";
import { toDictionary, toNamespaceDictionary } from "./to-dictionary.js";
import type {
  DictionarySpec,
  NormalizedKeyDictionary,
  ValidationIssue,
  ValidationResult,
} from "./types.js";
import { validateNormalizedKeyDictionaryPartial } from "./validate-normalized.js";

export function validateExternalDictionaryPartial<TSchema>(
  input: unknown,
  spec: DictionarySpec
): ValidationResult<Partial<TSchema>> {
  if (spec.mode === "single") {
    const step1 = normalizeKeyDictionaryPartial(input, spec.requiredKeys, spec.argsByKey, []);
    if (!step1.ok) {
      return step1;
    }

    const step2 = validateNormalizedKeyDictionaryPartial(step1.data, spec.argsByKey, spec, []);
    if (!step2.ok) {
      return step2;
    }

    return {
      ok: true,
      data: toDictionary({ mode: "single", keys: step2.data }) as Partial<TSchema>,
    };
  }

  const step1 = normalizeDictionaryPartial(input, spec);
  if (!step1.ok) {
    return step1;
  }

  if (step1.data.mode !== "multi") {
    return {
      ok: false,
      issues: [
        {
          kind: "invalid_input",
          message: "validateExternalDictionaryPartial requires multi-mode dictionary spec",
        },
      ],
    };
  }

  const issues: ValidationIssue[] = [];
  const namespaces: Record<string, NormalizedKeyDictionary> = {};

  for (const [namespace, keys] of Object.entries(step1.data.namespaces)) {
    const step2 = validateNormalizedKeyDictionaryPartial(
      keys,
      spec.argsByKey[namespace] ?? {},
      spec,
      [namespace]
    );
    if (!step2.ok) {
      issues.push(...step2.issues);
    } else {
      namespaces[namespace] = step2.data;
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    data: toDictionary({ mode: "multi", namespaces }) as Partial<TSchema>,
  };
}

export function validateExternalNamespacePartial<TNamespaceSchema>(
  namespace: string,
  input: unknown,
  spec: DictionarySpec
): ValidationResult<Partial<TNamespaceSchema>> {
  if (spec.mode !== "multi") {
    return {
      ok: false,
      issues: [
        {
          kind: "invalid_input",
          message: "validateExternalNamespacePartial requires multi-mode dictionary spec",
        },
      ],
    };
  }

  const knownKeys = spec.requiredKeys[namespace];
  if (!knownKeys) {
    return {
      ok: false,
      issues: [{ kind: "unknown_key", path: [namespace] }],
    };
  }

  const step1 = normalizeKeyDictionaryPartial(input, knownKeys, spec.argsByKey[namespace] ?? {}, [
    namespace,
  ]);
  if (!step1.ok) {
    return step1;
  }

  const step2 = validateNormalizedKeyDictionaryPartial(
    step1.data,
    spec.argsByKey[namespace] ?? {},
    spec,
    [namespace]
  );
  if (!step2.ok) {
    return step2;
  }

  return {
    ok: true,
    data: toNamespaceDictionary(
      { mode: "multi", namespaces: { [namespace]: step2.data } },
      namespace
    ) as Partial<TNamespaceSchema>,
  };
}

export function validateExternalKey<TKeySlice>(
  key: string,
  input: unknown,
  spec: Extract<DictionarySpec, { mode: "single" }>
): ValidationResult<TKeySlice>;

export function validateExternalKey<TKeySlice>(
  namespace: string,
  key: string,
  input: unknown,
  spec: Extract<DictionarySpec, { mode: "multi" }>
): ValidationResult<TKeySlice>;

export function validateExternalKey<TKeySlice>(
  namespaceOrKey: string,
  keyOrInput: string | unknown,
  inputOrSpec?: unknown,
  specMaybe?: DictionarySpec
): ValidationResult<TKeySlice> {
  if (specMaybe?.mode === "multi") {
    const namespace = namespaceOrKey;
    const key = keyOrInput as string;
    const input = inputOrSpec;
    const spec = specMaybe;

    return validateExternalNamespacePartial<TKeySlice>(
      namespace,
      { [key]: input },
      spec
    ) as ValidationResult<TKeySlice>;
  }

  const key = namespaceOrKey;
  const input = keyOrInput;
  const spec = inputOrSpec as Extract<DictionarySpec, { mode: "single" }>;

  return validateExternalDictionaryPartial<TKeySlice>(
    { [key]: input },
    spec
  ) as ValidationResult<TKeySlice>;
}

export {
  normalizeDictionaryPartial,
  normalizeKeyDictionaryPartial,
  toDictionary,
  toNamespaceDictionary,
};
export { validateNormalizedKeyDictionaryPartial } from "./validate-normalized.js";
export { createArgsSchema } from "./create-args-schema.js";
export { createNormalizedDictionarySchema } from "./create-normalized-schema.js";
export { DictionaryValidationError, assertValidDictionary, formatIssues } from "./errors.js";
export type {
  DictionarySpec,
  NormalizedDictionary,
  NormalizedKeyDictionary,
  NormalizedMultiDictionary,
  ParsedKeyEntry,
  ParsedLocaleEntry,
  ValidationIssue,
  ValidationResult,
  VariableSpec,
  VariableType,
} from "./types.js";

export type { ParseTemplateResult } from "../icu/parse-template.js";
export { parseTemplate } from "../icu/parse-template.js";
export {
  extractVariables,
  mergeVariableSpecs,
  variableSpecsEqual,
} from "../icu/extract-variables.js";
