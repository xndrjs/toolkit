// Automatically generated code. Do not edit manually.
import {
  normalizeDictionary,
  validateNormalizedDictionary,
  validateExternalNamespace as validateExternalNamespaceCore,
  toDictionary,
  type DictionarySpec,
  type NormalizedDictionary,
  type ValidationResult,
} from "@xndrjs/i18n/validation";
import type { MyProjectSchema } from "./i18n-types.generated";

export const DICTIONARY_SPEC = {
  mode: "multi" as const,
  requiredKeys: {
    default: ["some_key", "some_other_key", "welcome"] as const,
    billing: ["invoice_summary", "account_balance"] as const,
  },
  argsByKey: {
    default: {
      some_key: {},
      some_other_key: {},
      welcome: {
        name: "string",
      },
    },
    billing: {
      invoice_summary: {
        count: "number",
      },
      account_balance: {
        amount: "number",
      },
    },
  },
} satisfies DictionarySpec;

export function normalizeExternalDictionary(
  input: unknown
): ValidationResult<NormalizedDictionary> {
  return normalizeDictionary(input, DICTIONARY_SPEC);
}

export function validateNormalizedExternalDictionary(
  normalized: NormalizedDictionary
): ValidationResult<NormalizedDictionary> {
  return validateNormalizedDictionary(normalized, DICTIONARY_SPEC);
}

export function validateExternalDictionary(input: unknown): ValidationResult<MyProjectSchema> {
  const step1 = normalizeExternalDictionary(input);
  if (!step1.ok) {
    return step1;
  }

  const step2 = validateNormalizedExternalDictionary(step1.data);
  if (!step2.ok) {
    return step2;
  }

  return { ok: true, data: toDictionary(step2.data) as MyProjectSchema };
}

export function validateExternalNamespace<NS extends keyof MyProjectSchema>(
  namespace: NS,
  input: unknown
) {
  return validateExternalNamespaceCore<MyProjectSchema[NS]>(
    namespace as string,
    input,
    DICTIONARY_SPEC
  );
}
