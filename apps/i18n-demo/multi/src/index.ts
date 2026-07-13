import { formatIssues } from "@xndrjs/i18n/validation";
import {
  createI18n,
  namespaceLoaders,
  validateExternalDictionaryPartial,
  validateExternalNamespacePartial,
} from "./i18n";
import type { MyProjectLocale } from "./i18n/generated/i18n-types.generated";

const demoLocale = "en" as const satisfies MyProjectLocale;

export async function exampleCreateI18nForLocale(): Promise<void> {
  const view = await createI18n({}).withNamespaces(["default", "user"]).withLocale("de-CH").load();

  console.log("default.login_button @ de-CH:", view.t("default", "login_button"));
  console.log("user.greeting @ de-CH:", view.t("user", "greeting", { name: "Lena" }));
}

export async function exampleProjectNamespaceLocalesPatch(): Promise<void> {
  const activeLocale = "it";
  await namespaceLoaders.billing(activeLocale);
  const view = await createI18n({}).withNamespaces(["billing"]).withLocale(activeLocale).load();

  console.log("billing.invoice_summary @ it:", view.t("billing", "invoice_summary", { count: 3 }));
}

export async function exampleExternalNamespacePatch(): Promise<void> {
  const rawBilling: unknown = await namespaceLoaders.billing(demoLocale);

  const result = validateExternalNamespacePartial("billing", rawBilling);
  if (!result.ok) {
    console.error("billing mergeNamespace validation failed:", formatIssues(result.issues));
    return;
  }

  const view = await createI18n({})
    .withNamespaces(["billing"])
    .withLocale(demoLocale)
    .withNamespaceData("billing", result.data)
    .load();

  console.log("billing.invoice_summary @ en:", view.t("billing", "invoice_summary", { count: 1 }));
}

export async function exampleExternalDictionaryHydration(): Promise<void> {
  const raw = await loadExternalTranslations();

  const result = validateExternalDictionaryPartial(raw);
  if (!result.ok) {
    console.error("mergeAll validation failed:", formatIssues(result.issues));
    return;
  }

  const namespaces = ["default", "user", "billing"] as const;

  let builder = createI18n({}).withNamespaces(namespaces).withLocale(demoLocale);

  // Merge the validated external payload into the runtime engine via the builder hydration API.
  // Note: `validateExternalDictionaryPartial` returns `Partial<MyProjectSchema>` so we merge only what is present.
  for (const namespace of Object.keys(result.data) as (typeof namespaces)[number][]) {
    const data = result.data[namespace];
    if (data !== undefined) {
      builder = builder.withNamespaceData(namespace, data as never);
    }
  }

  const view = await builder.load();

  console.log("billing.invoice_summary @ en:", view.t("billing", "invoice_summary", { count: 12 }));
}

export async function exampleMergeAccumulatesAcrossLocales(): Promise<void> {
  // Same engine (same createI18n call) — load two locales over time.
  const builder = createI18n({}).withNamespaces(["billing"] as const);

  const itView = await builder.withLocale("it").load();
  console.log(
    "billing.invoice_summary @ it (after it load):",
    itView.t("billing", "invoice_summary", { count: 2 })
  );

  const enView = await builder.withLocale("en").load();
  console.log(
    "billing.invoice_summary @ en (after en load):",
    enView.t("billing", "invoice_summary", { count: 2 })
  );

  // Still works because the engine accumulated locales via merge, it didn’t replace the whole namespace.
  console.log(
    "billing.invoice_summary @ it (after en load):",
    itView.t("billing", "invoice_summary", { count: 2 })
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
  await exampleCreateI18nForLocale();
  await exampleProjectNamespaceLocalesPatch();
  await exampleExternalNamespacePatch();
  await exampleExternalDictionaryHydration();
  await exampleMergeAccumulatesAcrossLocales();
}

void main();
