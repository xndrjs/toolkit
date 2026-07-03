import { normalizeDictionary } from "./normalize.js";
import { toDictionary, toNamespaceDictionary } from "./to-dictionary.js";
import type { DictionarySpec, NormalizedDictionary, ValidationResult } from "./types.js";
import { validateNormalizedDictionary } from "./validate-normalized.js";

export function validateExternalDictionary<TSchema>(
  input: unknown,
  spec: DictionarySpec
): ValidationResult<TSchema> {
  const step1 = normalizeDictionary(input, spec);
  if (!step1.ok) {
    return step1;
  }

  const step2 = validateNormalizedDictionary(step1.data, spec);
  if (!step2.ok) {
    return step2;
  }

  return { ok: true, data: toDictionary(step2.data) as TSchema };
}

export function validateExternalNamespace<TNamespaceSchema>(
  namespace: string,
  input: unknown,
  spec: DictionarySpec
): ValidationResult<TNamespaceSchema> {
  if (spec.mode !== "multi") {
    return {
      ok: false,
      issues: [
        {
          kind: "invalid_input",
          message: "validateExternalNamespace requires multi-mode dictionary spec",
        },
      ],
    };
  }

  const wrapped = { [namespace]: input };
  const namespaceSpec: DictionarySpec = {
    mode: "multi",
    requiredKeys: {
      [namespace]: spec.requiredKeys[namespace] ?? [],
    },
    argsByKey: {
      [namespace]: spec.argsByKey[namespace] ?? {},
    },
  };

  const step1 = normalizeDictionary(wrapped, namespaceSpec);
  if (!step1.ok) {
    return step1;
  }

  const step2 = validateNormalizedDictionary(step1.data, namespaceSpec);
  if (!step2.ok) {
    return step2;
  }

  return {
    ok: true,
    data: toNamespaceDictionary(step2.data, namespace) as TNamespaceSchema,
  };
}

export { normalizeDictionary, validateNormalizedDictionary, toDictionary, toNamespaceDictionary };
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
