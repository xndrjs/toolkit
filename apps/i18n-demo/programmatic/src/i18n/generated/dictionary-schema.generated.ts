// Automatically generated code. Do not edit manually.
import {
  validateExternalDictionaryPartial as validateExternalDictionaryPartialCore,
  validateExternalKey as validateExternalKeyCore,
  type DictionarySpec,
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

export function validateExternalDictionaryPartial(
  input: unknown
): ValidationResult<Partial<ProgrammaticDemoSchema>> {
  return validateExternalDictionaryPartialCore<Partial<ProgrammaticDemoSchema>>(
    input,
    DICTIONARY_SPEC
  );
}

export function validateExternalKey<K extends keyof ProgrammaticDemoSchema>(
  key: K,
  input: unknown
): ValidationResult<Pick<ProgrammaticDemoSchema, K>> {
  return validateExternalKeyCore<Pick<ProgrammaticDemoSchema, K>>(
    key as string,
    input,
    DICTIONARY_SPEC
  );
}
