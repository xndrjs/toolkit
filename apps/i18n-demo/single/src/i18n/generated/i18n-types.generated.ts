// Automatically generated code. Do not edit manually.
export const I18N_MODE = "single" as const;

export const LOCALE_FALLBACK = {
  "de-CH": "en",
  en: null,
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
  invoice_due_long: { dueDate: Date | number };
  discount_rate: { rate: number };
  meeting_time: { startTime: Date | number };
};

export type MyProjectSchema = {
  login_button: Partial<Record<MyProjectLocale, string>>;
  welcome: Partial<Record<MyProjectLocale, string>>;
  dashboard_status: Partial<Record<MyProjectLocale, string>>;
  inbox_owner: Partial<Record<MyProjectLocale, string>>;
  ranking_position: Partial<Record<MyProjectLocale, string>>;
  account_balance: Partial<Record<MyProjectLocale, string>>;
  appointment_summary: Partial<Record<MyProjectLocale, string>>;
  invoice_due_long: Partial<Record<MyProjectLocale, string>>;
  discount_rate: Partial<Record<MyProjectLocale, string>>;
  meeting_time: Partial<Record<MyProjectLocale, string>>;
};
