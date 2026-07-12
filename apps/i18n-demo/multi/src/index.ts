import { formatIssues } from "@xndrjs/i18n/validation";
import {
  createI18nForLocale,
  ensureNamespacesLoadedForLocale,
  i18n,
  namespaceLoaders,
  projectNamespaceLocales,
  validateExternalDictionary,
  validateExternalNamespace,
} from "./i18n";
import type { MyProjectLocale } from "./i18n/generated/i18n-types.generated";

const demoLocale = "en" as const satisfies MyProjectLocale;

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

export async function exampleEnsureNamespacesLoadedForLocale(): Promise<void> {
  // All namespaces are lazy in split-by-locale mode — register them on the shared instance.
  await ensureNamespacesLoadedForLocale(i18n, demoLocale);

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

export async function exampleEnsureNamespacesForRoute(): Promise<void> {
  const billingLocale = "it" as const satisfies MyProjectLocale;

  // Billing route: load only the namespaces this page needs.
  await ensureNamespacesLoadedForLocale(i18n, billingLocale, ["billing"]);

  console.log(
    "billing.invoice_summary @ it (route-scoped ensureNamespacesLoadedForLocale):",
    i18n.get("billing", "invoice_summary", "it", { count: 2 })
  );
}

export async function exampleCreateI18nForLocale(): Promise<void> {
  // Per-request instance — useful when each request owns its own provider.
  const requestI18n = await createI18nForLocale("de-CH", ["default", "user"]);

  console.log(
    "default.login_button @ de-CH (per-request instance):",
    requestI18n.get("default", "login_button", "de-CH")
  );
  console.log(
    "user.greeting @ de-CH (per-request instance):",
    requestI18n.get("user", "greeting", "de-CH", { name: "Lena" })
  );
}

export async function exampleProjectNamespaceLocalesPatch(): Promise<void> {
  const activeLocale = "it";
  const billing = await namespaceLoaders.billing(activeLocale);
  i18n.mergeNamespace("billing", projectNamespaceLocales(billing, [activeLocale]));

  console.log(
    "billing.invoice_summary @ it (projectNamespaceLocales + mergeNamespace):",
    i18n.get("billing", "invoice_summary", "it", { count: 3 })
  );
  console.log(
    "billing.account_balance @ it (single-locale slice in memory):",
    i18n.get("billing", "account_balance", "it", { amount: 42 })
  );
}

export async function exampleExternalNamespacePatch(): Promise<void> {
  // namespaceLoaders simulates a fetch from split delivery JSON on disk/CDN.
  const rawBilling: unknown = await namespaceLoaders.billing(demoLocale);

  const result = validateExternalNamespace("billing", rawBilling);
  if (!result.ok) {
    console.error("billing mergeNamespace validation failed:", formatIssues(result.issues));
    return;
  }

  i18n.mergeNamespace("billing", result.data);

  console.log(
    "billing.invoice_summary @ en (patched from generated/translations/billing.en.json):",
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
    "billing.refund_policy_markdown @ en (patched, markdown from split compile):",
    i18n.get("billing", "refund_policy_markdown", "en", { days: 30 })
  );
}

export async function exampleExternalDictionaryHydration(): Promise<void> {
  const raw = await loadExternalTranslations();

  const result = validateExternalDictionary(raw);
  if (!result.ok) {
    console.error("mergeAll validation failed:", formatIssues(result.issues));
    return;
  }

  i18n.mergeAll(result.data);

  console.log(
    "billing.invoice_summary @ en (hydrated, split per-locale billing):",
    i18n.get("billing", "invoice_summary", "en", { count: 12 })
  );
  console.log(
    "billing.refund_policy_markdown @ en (hydrated, markdown headings/links):",
    i18n.get("billing", "refund_policy_markdown", "en", { days: 21 })
  );
}

async function loadExternalTranslations(): Promise<unknown> {
  const [defaultNs, user, billing] = await Promise.all([
    namespaceLoaders.default(demoLocale),
    namespaceLoaders.user(demoLocale),
    namespaceLoaders.billing(demoLocale),
  ]);

  return {
    default: defaultNs,
    user,
    billing,
  };
}

async function main(): Promise<void> {
  await ensureNamespacesLoadedForLocale(i18n, demoLocale, ["default"]);
  exampleMultiNamespaceUsage();
  await exampleEnsureNamespacesLoadedForLocale();
  await exampleEnsureNamespacesForRoute();
  await exampleCreateI18nForLocale();
  await exampleProjectNamespaceLocalesPatch();
  await exampleExternalNamespacePatch();
  await exampleExternalDictionaryHydration();
}

void main();
