// Automatically generated code. Do not edit manually.
import {
  normalizeDictionary,
  validateNormalizedDictionary,
  validateExternalNamespace as validateExternalNamespaceImpl,
  toDictionary,
  type DictionarySpec,
  type NormalizedDictionary,
  type ValidationResult,
} from "@xndrjs/i18n/validation";
import type { MyProjectSchema } from "./i18n-types.generated";

export const DICTIONARY_SPEC = {
  mode: "multi" as const,
  requiredKeys: {
    default: [
      "login_button",
      "welcome",
      "dashboard_status",
      "inbox_owner",
      "ranking_position",
    ] as const,
    user: ["profile_title", "greeting"] as const,
    billing: [
      "invoice_summary",
      "account_balance",
      "appointment_summary",
      "invoice_due_long",
      "discount_rate",
      "meeting_time",
      "payment_notice_html",
      "refund_policy_markdown",
    ] as const,
  },
  argsByKey: {
    default: {
      login_button: {},
      welcome: {
        name: "string",
      },
      dashboard_status: {
        msgCount: "number",
        chatCount: "number",
      },
      inbox_owner: {
        gender: "string",
        name: "string",
      },
      ranking_position: {
        position: "number",
      },
    },
    user: {
      profile_title: {},
      greeting: {
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
      appointment_summary: {
        dueDate: "date",
        startTime: "date",
      },
      invoice_due_long: {
        dueDate: "date",
      },
      discount_rate: {
        rate: "number",
      },
      meeting_time: {
        startTime: "date",
      },
      payment_notice_html: {
        amount: "number",
        dueDate: "date",
      },
      refund_policy_markdown: {
        days: "number",
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
  return validateExternalNamespaceImpl<MyProjectSchema[NS]>(
    namespace as string,
    input,
    DICTIONARY_SPEC
  );
}
