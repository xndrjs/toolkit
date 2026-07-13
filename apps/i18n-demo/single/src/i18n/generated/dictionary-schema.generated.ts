// Automatically generated code. Do not edit manually.
import {
  validateExternalDictionaryPartial as validateExternalDictionaryPartialCore,
  validateExternalKey as validateExternalKeyCore,
  type DictionarySpec,
  type ValidationResult,
} from "@xndrjs/i18n/validation";
import type { MyProjectSchema } from "./i18n-types.generated";

export const DICTIONARY_SPEC = {
  mode: "single" as const,
  requiredKeys: [
    "login_button",
    "welcome",
    "dashboard_status",
    "inbox_owner",
    "ranking_position",
    "account_balance",
    "appointment_summary",
    "invoice_due_long",
    "discount_rate",
    "meeting_time",
  ] as const,
  argsByKey: {
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
  },
} satisfies DictionarySpec;

export function validateExternalDictionaryPartial(
  input: unknown
): ValidationResult<Partial<MyProjectSchema>> {
  return validateExternalDictionaryPartialCore<Partial<MyProjectSchema>>(input, DICTIONARY_SPEC);
}

export function validateExternalKey<K extends keyof MyProjectSchema>(
  key: K,
  input: unknown
): ValidationResult<Pick<MyProjectSchema, K>> {
  return validateExternalKeyCore<Pick<MyProjectSchema, K>>(key as string, input, DICTIONARY_SPEC);
}
