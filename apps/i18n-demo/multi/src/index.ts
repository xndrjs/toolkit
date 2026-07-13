import { formatIssues } from "@xndrjs/i18n/validation";
import {
  createI18n,
  namespaceLoaders,
  validateExternalDictionaryPartial,
  validateExternalKey,
  validateExternalNamespacePartial,
} from "./i18n";
import type { MyProjectLocale, MyProjectSchema } from "./i18n/generated/i18n-types.generated";

const demoLocale = "en" as const satisfies MyProjectLocale;

export async function exampleCreateI18nForLocale(): Promise<void> {
  const scope = await createI18n({}).withNamespaces(["default", "user"]).withLocale("de-CH").load();

  console.log("default.login_button @ de-CH:", scope.t("default", "login_button"));
  console.log("user.greeting @ de-CH:", scope.t("user", "greeting", { name: "Lena" }));
}

export async function exampleProjectNamespaceLocalesPatch(): Promise<void> {
  const activeLocale = "it";
  const scope = await createI18n({}).withNamespaces(["billing"]).withLocale(activeLocale).load();

  scope.set(
    "billing",
    "invoice_summary",
    "Hai {count, plural, one {1 fattura aggiornata} other {# fatture aggiornate}}"
  );

  console.log("billing.invoice_summary @ it:", scope.t("billing", "invoice_summary", { count: 3 }));
}

export async function exampleExternalNamespacePatch(): Promise<void> {
  const rawBilling: unknown = await namespaceLoaders.billing(demoLocale);

  const result = validateExternalNamespacePartial("billing", rawBilling);
  if (!result.ok) {
    console.error("billing validation failed:", formatIssues(result.issues));
    return;
  }

  const scope = await createI18n({}).withNamespaces(["billing"]).withLocale(demoLocale).load();

  for (const key of Object.keys(result.data) as (keyof MyProjectSchema["billing"])[]) {
    const locales = result.data[key];
    if (locales === undefined) continue;

    const keyResult = validateExternalKey("billing", key, locales);
    if (!keyResult.ok) {
      console.error(`billing.${key} validation failed:`, formatIssues(keyResult.issues));
      continue;
    }

    const template = keyResult.data[key]?.[demoLocale];
    if (template !== undefined) {
      scope.set("billing", key, template);
    }
  }

  console.log("billing.invoice_summary @ en:", scope.t("billing", "invoice_summary", { count: 1 }));
}

export async function exampleExternalDictionaryHydration(): Promise<void> {
  const raw = await loadExternalTranslations();

  const result = validateExternalDictionaryPartial(raw);
  if (!result.ok) {
    console.error("dictionary validation failed:", formatIssues(result.issues));
    return;
  }

  const namespaces = ["default", "user", "billing"] as const;

  const scope = await createI18n({}).withNamespaces(namespaces).withLocale(demoLocale).load();

  for (const namespace of Object.keys(result.data) as (typeof namespaces)[number][]) {
    const nsData = result.data[namespace];
    if (nsData === undefined) continue;

    for (const key of Object.keys(nsData) as (keyof MyProjectSchema[typeof namespace])[]) {
      const locales = nsData[key];
      if (locales === undefined) continue;

      const keyResult = validateExternalKey(namespace, key, locales);
      if (!keyResult.ok) {
        console.error(`${namespace}.${key} validation failed:`, formatIssues(keyResult.issues));
        continue;
      }

      const template = keyResult.data[key]?.[demoLocale];
      if (template !== undefined) {
        scope.set(namespace, key, template);
      }
    }
  }

  console.log(
    "billing.invoice_summary @ en:",
    scope.t("billing", "invoice_summary", { count: 12 })
  );
}

export async function exampleMergeAccumulatesAcrossLocales(): Promise<void> {
  // Same engine (same createI18n call) — load two locales over time.
  const builder = createI18n({}).withNamespaces(["billing"] as const);

  const itScope = await builder.withLocale("it").load();
  console.log(
    "billing.invoice_summary @ it (after it load):",
    itScope.t("billing", "invoice_summary", { count: 2 })
  );

  const enScope = await builder.withLocale("en").load();
  console.log(
    "billing.invoice_summary @ en (after en load):",
    enScope.t("billing", "invoice_summary", { count: 2 })
  );

  // Still works because load() deep-merges locale entries on the shared engine.
  console.log(
    "billing.invoice_summary @ it (after en load):",
    itScope.t("billing", "invoice_summary", { count: 2 })
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
