// Automatically generated code. Do not edit manually.
import {
  normalizeDictionary,
  validateNormalizedDictionary,
  toDictionary,
  type DictionarySpec,
  type NormalizedDictionary,
  type ValidationResult,
} from "@xndrjs/i18n/validation";
import type { ProgrammaticDemoSchema } from "./i18n-types.generated";

export const DICTIONARY_SPEC = {
  mode: "single" as const,
  requiredKeys: ["welcome"] as const,
  argsByKey: {
    welcome: {
      name: "string",
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

export function validateExternalDictionary(
  input: unknown
): ValidationResult<ProgrammaticDemoSchema> {
  const step1 = normalizeExternalDictionary(input);
  if (!step1.ok) {
    return step1;
  }

  const step2 = validateNormalizedExternalDictionary(step1.data);
  if (!step2.ok) {
    return step2;
  }

  return { ok: true, data: toDictionary(step2.data) as ProgrammaticDemoSchema };
}
