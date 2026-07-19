// Automatically generated code. Do not edit manually.
import {
  validateExternalDictionaryPartial as validateExternalDictionaryPartialCore,
  validateExternalNamespacePartial as validateExternalNamespacePartialCore,
  validateExternalKey as validateExternalKeyCore,
  type DictionarySpec,
  type ValidationResult,
} from "@xndrjs/i18n/validation";
import type { ProgrammaticDemoSchema } from "./i18n-types.generated";

export const DICTIONARY_SPEC = {
  mode: "multi" as const,
  requiredKeys: {
    default: ["welcome"] as const,
    cms: ["footer_note"] as const,
  },
  argsByKey: {
    default: {
      welcome: {
        name: "string",
      },
    },
    cms: {
      footer_note: {},
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

export function validateExternalNamespacePartial<NS extends keyof ProgrammaticDemoSchema>(
  namespace: NS,
  input: unknown
): ValidationResult<Partial<ProgrammaticDemoSchema[NS]>> {
  return validateExternalNamespacePartialCore<Partial<ProgrammaticDemoSchema[NS]>>(
    namespace as string,
    input,
    DICTIONARY_SPEC
  );
}

export function validateExternalKey<
  NS extends keyof ProgrammaticDemoSchema,
  K extends keyof ProgrammaticDemoSchema[NS],
>(namespace: NS, key: K, input: unknown): ValidationResult<Pick<ProgrammaticDemoSchema[NS], K>> {
  return validateExternalKeyCore<Pick<ProgrammaticDemoSchema[NS], K>>(
    namespace as string,
    key as string,
    input,
    DICTIONARY_SPEC
  );
}
