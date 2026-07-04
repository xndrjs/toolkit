import { formatIssues } from "@xndrjs/i18n/validation";
import { i18n } from "./i18n/index.js";
import { dictionary } from "./i18n/generated/dictionary.generated.js";
import { validateExternalDictionary } from "./i18n/generated/dictionary-schema.generated.js";

export function exampleSingleFileUsage(): void {
  i18n.get("login_button", "it");
  i18n.get("login_button", "de-CH");
  i18n.get("welcome", "en", { name: "Ada" });
  i18n.get("dashboard_status", "it", { msgCount: 3, chatCount: 2 });
  i18n.get("inbox_owner", "en", { gender: "female", name: "Ada" });
  i18n.get("ranking_position", "en", { position: 3 });
  i18n.get("account_balance", "en", { amount: 1234.5 });
  i18n.get("appointment_summary", "en", {
    dueDate: new Date("2026-07-01T13:30:00Z"),
    startTime: new Date("2026-07-01T13:30:00Z"),
  });

  const t = i18n.forLocale("en");
  t.get("dashboard_status", { msgCount: 3, chatCount: 2 });
  t.get("login_button");
  t.get("welcome", { name: "Ada" });
  t.get("inbox_owner", { gender: "other", name: "Sam" });
  t.get("ranking_position", { position: 4 });
  t.get("account_balance", { amount: 1234.5 });
  t.get("appointment_summary", {
    dueDate: new Date("2026-07-01T13:30:00Z"),
    startTime: new Date("2026-07-01T13:30:00Z"),
  });
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
  i18n.get("welcome", "en", { name: "Ada" });
}

async function loadExternalTranslations(): Promise<unknown> {
  return dictionary;
}

exampleSingleFileUsage();
