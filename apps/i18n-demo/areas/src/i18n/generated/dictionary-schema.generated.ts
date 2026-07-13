// Automatically generated code. Do not edit manually.
import {
  validateExternalDictionaryPartial as validateExternalDictionaryPartialCore,
  validateExternalNamespacePartial as validateExternalNamespacePartialCore,
  validateExternalKey as validateExternalKeyCore,
  type DictionarySpec,
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

export function validateExternalDictionaryPartial(
  input: unknown
): ValidationResult<Partial<MyProjectSchema>> {
  return validateExternalDictionaryPartialCore<Partial<MyProjectSchema>>(input, DICTIONARY_SPEC);
}

export function validateExternalNamespacePartial<NS extends keyof MyProjectSchema>(
  namespace: NS,
  input: unknown
): ValidationResult<Partial<MyProjectSchema[NS]>> {
  return validateExternalNamespacePartialCore<Partial<MyProjectSchema[NS]>>(
    namespace as string,
    input,
    DICTIONARY_SPEC
  );
}

export function validateExternalKey<
  NS extends keyof MyProjectSchema,
  K extends keyof MyProjectSchema[NS],
>(namespace: NS, key: K, input: unknown): ValidationResult<Pick<MyProjectSchema[NS], K>> {
  return validateExternalKeyCore<Pick<MyProjectSchema[NS], K>>(
    namespace as string,
    key as string,
    input,
    DICTIONARY_SPEC
  );
}
