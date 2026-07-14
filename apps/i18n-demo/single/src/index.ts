import { formatIssues } from "@xndrjs/i18n/validation";
import { i18n, defaultDictionary } from "./i18n";
import { validateExternalDictionaryPartial } from "./i18n/generated/dictionary-schema.generated";

export function exampleSingleFileUsage(): void {
  const { t, forLocale } = i18n;

  console.log("login_button @ it:", t("login_button", "it"));
  console.log("login_button @ de-CH:", t("login_button", "de-CH"));
  console.log("welcome @ en:", t("welcome", "en", { name: "Ada" }));
  console.log("dashboard_status @ it:", t("dashboard_status", "it", { msgCount: 3, chatCount: 2 }));
  console.log("inbox_owner @ en:", t("inbox_owner", "en", { gender: "female", name: "Ada" }));
  console.log("ranking_position @ en:", t("ranking_position", "en", { position: 3 }));
  console.log("account_balance @ en:", t("account_balance", "en", { amount: 1234.5 }));
  console.log(
    "appointment_summary @ en:",
    t("appointment_summary", "en", {
      dueDate: new Date("2026-07-01T13:30:00Z"),
      startTime: new Date("2026-07-01T13:30:00Z"),
    })
  );
  console.log(
    "invoice_due_long @ en:",
    t("invoice_due_long", "en", { dueDate: new Date("2026-07-01T13:30:00Z") })
  );
  console.log("discount_rate @ en:", t("discount_rate", "en", { rate: 0.25 }));
  console.log(
    "meeting_time @ en:",
    t("meeting_time", "en", { startTime: new Date("2026-07-01T13:30:00Z") })
  );

  const { t: tEn } = forLocale("en");
  console.log(
    "dashboard_status @ en (bound):",
    tEn("dashboard_status", { msgCount: 3, chatCount: 2 })
  );
  console.log("login_button @ en (bound):", tEn("login_button"));
  console.log("welcome @ en (bound):", tEn("welcome", { name: "Ada" }));
  console.log("inbox_owner @ en (bound):", tEn("inbox_owner", { gender: "other", name: "Sam" }));
  console.log("ranking_position @ en (bound):", tEn("ranking_position", { position: 4 }));
  console.log("account_balance @ en (bound):", tEn("account_balance", { amount: 1234.5 }));
  console.log(
    "appointment_summary @ en (bound):",
    tEn("appointment_summary", {
      dueDate: new Date("2026-07-01T13:30:00Z"),
      startTime: new Date("2026-07-01T13:30:00Z"),
    })
  );

  console.log("ghost_key @ en (onMissing: custom):", t("ghost_key" as "login_button", "en"));
}

export async function exampleExternalDictionaryHydration(): Promise<void> {
  const raw: unknown = await loadExternalTranslations();

  const result = validateExternalDictionaryPartial(raw);
  if (!result.ok) {
    // optional: format issues and log as readable error
    console.error(formatIssues(result.issues));
    return;
  }

  // Note: `i18n` is a scope; use a fresh engine if you need mutation (see package docs).
  const { t } = i18n;
  console.log("welcome @ en (validated):", t("welcome", "en", { name: "Ada" }));
}

async function loadExternalTranslations(): Promise<unknown> {
  return defaultDictionary;
}

exampleSingleFileUsage();
