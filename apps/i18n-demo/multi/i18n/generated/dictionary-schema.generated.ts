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
