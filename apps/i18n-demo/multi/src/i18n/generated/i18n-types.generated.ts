// Automatically generated code. Do not edit manually.
export const I18N_MODE = "multi" as const;

export const LOCALE_FALLBACK = {
  "de-CH": "de-DE",
  "de-DE": "en",
  en: null,
  it: "en",
} as const satisfies Record<string, string | null>;

export type MyProjectLocaleFallback = typeof LOCALE_FALLBACK;

export type MyProjectLocale = "de-CH" | "de-DE" | "en" | "it";

export type MyProjectParams = {
  default: {
    login_button: never;
    welcome: { name: string };
    dashboard_status: { msgCount: number; chatCount: number };
    inbox_owner: { gender: string; name: string };
    ranking_position: { position: number };
  };
  user: {
    profile_title: never;
    greeting: { name: string };
  };
  billing: {
    invoice_summary: { count: number };
    account_balance: { amount: number };
    appointment_summary: { dueDate: Date | number; startTime: Date | number };
    invoice_due_long: { dueDate: Date | number };
    discount_rate: { rate: number };
    meeting_time: { startTime: Date | number };
    payment_notice_html: { amount: number; dueDate: Date | number };
    refund_policy_markdown: { days: number };
  };
};

export type MyProjectSchema = {
  default: typeof import("../translations/default.json");
  user: typeof import("../translations/user.json");
  billing: typeof import("./translations/billing.json");
};
export type LoadOnInitNamespace = "default";
export type LazyNamespace = "user" | "billing";
export type InitialSchema = Pick<MyProjectSchema, LoadOnInitNamespace>;
