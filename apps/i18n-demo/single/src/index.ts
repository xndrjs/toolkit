import { formatIssues } from "@xndrjs/i18n/validation";
import { i18n, defaultDictionary } from "./i18n";
import { validateExternalDictionaryPartial } from "./i18n/generated/dictionary-schema.generated";

export function exampleSingleFileUsage(): void {
  console.log("login_button @ it:", i18n.t("login_button", "it"));
  console.log("login_button @ de-CH:", i18n.t("login_button", "de-CH"));
  console.log("welcome @ en:", i18n.t("welcome", "en", { name: "Ada" }));
  console.log(
    "dashboard_status @ it:",
    i18n.t("dashboard_status", "it", { msgCount: 3, chatCount: 2 })
  );
  console.log("inbox_owner @ en:", i18n.t("inbox_owner", "en", { gender: "female", name: "Ada" }));
  console.log("ranking_position @ en:", i18n.t("ranking_position", "en", { position: 3 }));
  console.log("account_balance @ en:", i18n.t("account_balance", "en", { amount: 1234.5 }));
  console.log(
    "appointment_summary @ en:",
    i18n.t("appointment_summary", "en", {
      dueDate: new Date("2026-07-01T13:30:00Z"),
      startTime: new Date("2026-07-01T13:30:00Z"),
    })
  );
  console.log(
    "invoice_due_long @ en:",
    i18n.t("invoice_due_long", "en", { dueDate: new Date("2026-07-01T13:30:00Z") })
  );
  console.log("discount_rate @ en:", i18n.t("discount_rate", "en", { rate: 0.25 }));
  console.log(
    "meeting_time @ en:",
    i18n.t("meeting_time", "en", { startTime: new Date("2026-07-01T13:30:00Z") })
  );

  const t = i18n.forLocale("en");
  console.log(
    "dashboard_status @ en (bound):",
    t.t("dashboard_status", { msgCount: 3, chatCount: 2 })
  );
  console.log("login_button @ en (bound):", t.t("login_button"));
  console.log("welcome @ en (bound):", t.t("welcome", { name: "Ada" }));
  console.log("inbox_owner @ en (bound):", t.t("inbox_owner", { gender: "other", name: "Sam" }));
  console.log("ranking_position @ en (bound):", t.t("ranking_position", { position: 4 }));
  console.log("account_balance @ en (bound):", t.t("account_balance", { amount: 1234.5 }));
  console.log(
    "appointment_summary @ en (bound):",
    t.t("appointment_summary", {
      dueDate: new Date("2026-07-01T13:30:00Z"),
      startTime: new Date("2026-07-01T13:30:00Z"),
    })
  );

  console.log("ghost_key @ en (onMissing: custom):", i18n.t("ghost_key" as "login_button", "en"));
}

export async function exampleExternalDictionaryHydration(): Promise<void> {
  const raw: unknown = await loadExternalTranslations();

  const result = validateExternalDictionaryPartial(raw);
  if (!result.ok) {
    // optional: format issues and log as readable error
    console.error(formatIssues(result.issues));
    return;
  }

  // Note: `i18n` is a view; use a fresh engine if you need mutation (see package docs).
  console.log("welcome @ en (validated):", i18n.t("welcome", "en", { name: "Ada" }));
}

async function loadExternalTranslations(): Promise<unknown> {
  return defaultDictionary;
}

exampleSingleFileUsage();
