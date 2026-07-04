// Automatically generated code. Do not edit manually.
export const I18N_MODE = "single" as const;

export const LOCALE_FALLBACK = {
  en: null,
  "de-CH": "en",
  it: "en",
} as const satisfies Record<string, string | null>;

export type MyProjectLocaleFallback = typeof LOCALE_FALLBACK;

export type MyProjectLocale = "de-CH" | "en" | "it";

export type MyProjectParams = {
  login_button: never;
  welcome: { name: string };
  dashboard_status: { msgCount: number; chatCount: number };
  inbox_owner: { gender: string; name: string };
  ranking_position: { position: number };
  account_balance: { amount: number };
  appointment_summary: { dueDate: Date | number; startTime: Date | number };
};

export type MyProjectSchema = typeof import("../translations/translations.json");
