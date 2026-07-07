import { formatIssues } from "@xndrjs/i18n/validation";
import { i18n, dictionary } from "./i18n";
import { validateExternalDictionary } from "./i18n/generated/dictionary-schema.generated";

export function exampleSingleFileUsage(): void {
  console.log("login_button @ it:", i18n.get("login_button", "it"));
  console.log("login_button @ de-CH:", i18n.get("login_button", "de-CH"));
  console.log("welcome @ en:", i18n.get("welcome", "en", { name: "Ada" }));
  console.log(
    "dashboard_status @ it:",
    i18n.get("dashboard_status", "it", { msgCount: 3, chatCount: 2 })
  );
  console.log(
    "inbox_owner @ en:",
    i18n.get("inbox_owner", "en", { gender: "female", name: "Ada" })
  );
  console.log("ranking_position @ en:", i18n.get("ranking_position", "en", { position: 3 }));
  console.log("account_balance @ en:", i18n.get("account_balance", "en", { amount: 1234.5 }));
  console.log(
    "appointment_summary @ en:",
    i18n.get("appointment_summary", "en", {
      dueDate: new Date("2026-07-01T13:30:00Z"),
      startTime: new Date("2026-07-01T13:30:00Z"),
    })
  );
  console.log(
    "invoice_due_long @ en:",
    i18n.get("invoice_due_long", "en", { dueDate: new Date("2026-07-01T13:30:00Z") })
  );
  console.log("discount_rate @ en:", i18n.get("discount_rate", "en", { rate: 0.25 }));
  console.log(
    "meeting_time @ en:",
    i18n.get("meeting_time", "en", { startTime: new Date("2026-07-01T13:30:00Z") })
  );

  const t = i18n.forLocale("en");
  console.log(
    "dashboard_status @ en (bound):",
    t.get("dashboard_status", { msgCount: 3, chatCount: 2 })
  );
  console.log("login_button @ en (bound):", t.get("login_button"));
  console.log("welcome @ en (bound):", t.get("welcome", { name: "Ada" }));
  console.log("inbox_owner @ en (bound):", t.get("inbox_owner", { gender: "other", name: "Sam" }));
  console.log("ranking_position @ en (bound):", t.get("ranking_position", { position: 4 }));
  console.log("account_balance @ en (bound):", t.get("account_balance", { amount: 1234.5 }));
  console.log(
    "appointment_summary @ en (bound):",
    t.get("appointment_summary", {
      dueDate: new Date("2026-07-01T13:30:00Z"),
      startTime: new Date("2026-07-01T13:30:00Z"),
    })
  );
}

export async function exampleExternalDictionaryHydration(): Promise<void> {
  const raw: unknown = await loadExternalTranslations();

  const result = validateExternalDictionary(raw);
  if (!result.ok) {
    // optional: format issues and log as readable error
    console.error(formatIssues(result.issues));
    return;
  }

  i18n.setAll(result.data);
  console.log("welcome @ en (hydrated):", i18n.get("welcome", "en", { name: "Ada" }));
}

async function loadExternalTranslations(): Promise<unknown> {
  return dictionary;
}

exampleSingleFileUsage();
