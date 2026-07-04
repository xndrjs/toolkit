import { formatIssues } from "@xndrjs/i18n/validation";
import { ensureNamespacesLoaded, i18n } from "./i18n/index.js";
import { dictionary } from "./i18n/generated/dictionary.generated.js";
import {
  validateExternalDictionary,
  validateExternalNamespace,
} from "./i18n/generated/dictionary-schema.generated.js";

export function exampleMultiNamespaceUsage(): void {
  i18n.get("default", "login_button", "it");
  i18n.get("default", "login_button", "de-CH");
  i18n.get("default", "welcome", "en", { name: "Ada" });
  i18n.get("default", "dashboard_status", "it", { msgCount: 3, chatCount: 2 });
  i18n.get("default", "inbox_owner", "en", { gender: "female", name: "Ada" });
  i18n.get("default", "ranking_position", "en", { position: 3 });

  const t = i18n.forLocale("en");
  t.get("default", "login_button");
  t.get("default", "welcome", { name: "Ada" });
  t.get("default", "dashboard_status", { msgCount: 3, chatCount: 2 });
  t.get("default", "inbox_owner", { gender: "other", name: "Sam" });
  t.get("default", "ranking_position", { position: 4 });
}

export async function exampleLazyNamespaceLoading(): Promise<void> {
  await ensureNamespacesLoaded(i18n, ["user", "billing"]);

  i18n.get("user", "greeting", "en", { name: "Ada" });
  i18n.get("billing", "invoice_summary", "it", { count: 5 });
  i18n.get("billing", "account_balance", "en", { amount: 1234.5 });
  i18n.get("billing", "appointment_summary", "en", {
    dueDate: new Date("2026-07-01T13:30:00Z"),
    startTime: new Date("2026-07-01T13:30:00Z"),
  });

  const t = i18n.forLocale("en");
  t.get("user", "greeting", { name: "Ada" });
  t.get("billing", "invoice_summary", { count: 5 });
  t.get("billing", "account_balance", { amount: 1234.5 });
  t.get("billing", "appointment_summary", {
    dueDate: new Date("2026-07-01T13:30:00Z"),
    startTime: new Date("2026-07-01T13:30:00Z"),
  });
}

export async function exampleExternalDictionaryHydration(): Promise<void> {
  const raw: unknown = await loadExternalTranslations();

  const result = validateExternalDictionary(raw);
  if (!result.ok) {
    console.error(formatIssues(result.issues));
    return;
  }

  i18n.setAll(result.data);
  i18n.get("billing", "invoice_summary", "en", { count: 12 });
}

export async function exampleExternalNamespacePatch(): Promise<void> {
  const rawBilling: unknown = await loadExternalBillingTranslations();

  const result = validateExternalNamespace("billing", rawBilling);
  if (!result.ok) {
    console.error(formatIssues(result.issues));
    return;
  }

  i18n.setNamespace("billing", result.data);
}

async function loadExternalTranslations(): Promise<unknown> {
  const [user, billing] = await Promise.all([
    import("./i18n/translations/user.json").then((module) => module.default),
    import("./i18n/translations/billing.json").then((module) => module.default),
  ]);

  return {
    ...dictionary,
    user,
    billing,
  };
}

async function loadExternalBillingTranslations(): Promise<unknown> {
  return import("./i18n/translations/billing.json").then((module) => module.default);
}

exampleMultiNamespaceUsage();
void exampleLazyNamespaceLoading();
