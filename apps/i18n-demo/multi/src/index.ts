import { formatIssues } from "@xndrjs/i18n/validation";
import { defaultDictionary, i18n, namespaceLoaders, projectNamespaceLocales } from "./i18n";
import {
  validateExternalDictionary,
  validateExternalNamespace,
} from "./i18n/generated/dictionary-schema.generated";

export function exampleMultiNamespaceUsage(): void {
  console.log("default.login_button @ it:", i18n.get("default", "login_button", "it"));
  console.log("default.login_button @ de-CH:", i18n.get("default", "login_button", "de-CH"));
  console.log("default.welcome @ en:", i18n.get("default", "welcome", "en", { name: "Ada" }));
  console.log(
    "default.dashboard_status @ it:",
    i18n.get("default", "dashboard_status", "it", { msgCount: 3, chatCount: 2 })
  );
  console.log(
    "default.inbox_owner @ en:",
    i18n.get("default", "inbox_owner", "en", { gender: "female", name: "Ada" })
  );
  console.log(
    "default.ranking_position @ en:",
    i18n.get("default", "ranking_position", "en", { position: 3 })
  );

  const t = i18n.forLocale("en");
  console.log("default.login_button @ en (bound):", t.get("default", "login_button"));
  console.log("default.welcome @ en (bound):", t.get("default", "welcome", { name: "Ada" }));
  console.log(
    "default.dashboard_status @ en (bound):",
    t.get("default", "dashboard_status", { msgCount: 3, chatCount: 2 })
  );
  console.log(
    "default.inbox_owner @ en (bound):",
    t.get("default", "inbox_owner", { gender: "other", name: "Sam" })
  );
  console.log(
    "default.ranking_position @ en (bound):",
    t.get("default", "ranking_position", { position: 4 })
  );
}

export async function exampleLazyNamespaceLoading(): Promise<void> {
  await Promise.all(
    (["user", "billing"] as const).map(async (namespace) => {
      if (i18n.hasNamespace(namespace)) {
        return;
      }
      i18n.setNamespace(namespace, await namespaceLoaders[namespace]());
    })
  );

  console.log("user.greeting @ en:", i18n.get("user", "greeting", "en", { name: "Ada" }));
  console.log(
    "billing.invoice_summary @ it:",
    i18n.get("billing", "invoice_summary", "it", { count: 5 })
  );
  console.log(
    "billing.account_balance @ en:",
    i18n.get("billing", "account_balance", "en", { amount: 1234.5 })
  );
  console.log(
    "billing.appointment_summary @ en:",
    i18n.get("billing", "appointment_summary", "en", {
      dueDate: new Date("2026-07-01T13:30:00Z"),
      startTime: new Date("2026-07-01T13:30:00Z"),
    })
  );
  console.log(
    "billing.invoice_due_long @ en:",
    i18n.get("billing", "invoice_due_long", "en", {
      dueDate: new Date("2026-07-01T13:30:00Z"),
    })
  );
  console.log(
    "billing.discount_rate @ en:",
    i18n.get("billing", "discount_rate", "en", { rate: 0.25 })
  );
  console.log(
    "billing.meeting_time @ en:",
    i18n.get("billing", "meeting_time", "en", {
      startTime: new Date("2026-07-01T13:30:00Z"),
    })
  );
  try {
    console.log(
      "billing.payment_notice_html @ en:",
      i18n.get("billing", "payment_notice_html", "en", {
        amount: 99.5,
        dueDate: new Date("2026-07-01T13:30:00Z"),
      })
    );
  } catch (error) {
    console.error(
      "billing.payment_notice_html @ en (error):",
      error instanceof Error ? error.message : error
    );
  }
  console.log(
    "billing.refund_policy_markdown @ en:",
    i18n.get("billing", "refund_policy_markdown", "en", { days: 14 })
  );

  const t = i18n.forLocale("en");
  console.log("user.greeting @ en (bound):", t.get("user", "greeting", { name: "Ada" }));
  console.log(
    "billing.invoice_summary @ en (bound):",
    t.get("billing", "invoice_summary", { count: 5 })
  );
  console.log(
    "billing.account_balance @ en (bound):",
    t.get("billing", "account_balance", { amount: 1234.5 })
  );
  console.log(
    "billing.appointment_summary @ en (bound):",
    t.get("billing", "appointment_summary", {
      dueDate: new Date("2026-07-01T13:30:00Z"),
      startTime: new Date("2026-07-01T13:30:00Z"),
    })
  );
}

export async function exampleProjectNamespaceLocalesPatch(): Promise<void> {
  const activeLocale = "it" as const;
  const billing = await namespaceLoaders.billing();
  i18n.setNamespace("billing", projectNamespaceLocales(billing, [activeLocale]));

  console.log(
    "billing.invoice_summary @ it (projectNamespaceLocales + setNamespace):",
    i18n.get("billing", "invoice_summary", "it", { count: 3 })
  );
  console.log(
    "billing.account_balance @ it (single-locale slice in memory):",
    i18n.get("billing", "account_balance", "it", { amount: 42 })
  );
}

export async function exampleExternalNamespacePatch(): Promise<void> {
  // We use namespaceLoaders here but simulate an external fetch...
  const rawBilling: unknown = await namespaceLoaders.billing();

  // ...so we re-validate after loading
  const result = validateExternalNamespace("billing", rawBilling);
  if (!result.ok) {
    console.error("billing setNamespace validation failed:", formatIssues(result.issues));
    return;
  }

  i18n.setNamespace("billing", result.data);

  console.log(
    "billing.invoice_summary @ en (patched from generated/translations/billing.json):",
    i18n.get("billing", "invoice_summary", "en", { count: 1 })
  );
  console.log(
    "billing.payment_notice_html @ en (patched, ICU-quoted HTML):",
    i18n.get("billing", "payment_notice_html", "en", {
      amount: 250,
      dueDate: new Date("2026-08-01T10:00:00Z"),
    })
  );
  console.log(
    "billing.refund_policy_markdown @ en (patched, markdown from YAML compile):",
    i18n.get("billing", "refund_policy_markdown", "en", { days: 30 })
  );
}

export async function exampleExternalDictionaryHydration(): Promise<void> {
  const raw: unknown = await loadExternalTranslations();

  const result = validateExternalDictionary(raw);
  if (!result.ok) {
    console.error("setAll validation failed:", formatIssues(result.issues));
    return;
  }

  i18n.setAll(result.data);

  console.log(
    "billing.invoice_summary @ en (hydrated, billing from YAML→JSON compile):",
    i18n.get("billing", "invoice_summary", "en", { count: 12 })
  );
  console.log(
    "billing.refund_policy_markdown @ en (hydrated, markdown headings/links):",
    i18n.get("billing", "refund_policy_markdown", "en", { days: 21 })
  );
}

async function loadExternalTranslations(): Promise<unknown> {
  // We use namespaceLoaders here but simulate an external fetch, so we re-validate.
  const [user, billing] = await Promise.all([namespaceLoaders.user(), namespaceLoaders.billing()]);

  return {
    ...defaultDictionary,
    user,
    billing,
  };
}

async function main(): Promise<void> {
  exampleMultiNamespaceUsage();
  await exampleLazyNamespaceLoading();
  await exampleProjectNamespaceLocalesPatch();
  await exampleExternalNamespacePatch();
  await exampleExternalDictionaryHydration();
}

void main();
