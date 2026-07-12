import { formatIssues } from "@xndrjs/i18n/validation";
import {
  createI18n,
  createI18nForArea,
  ensureNamespacesLoadedForArea,
  LOCALE_DELIVERY_AREA,
  namespaceLoaders,
  projectNamespaceLocales,
  validateExternalDictionary,
  validateExternalNamespace,
  type MyProjectDeliveryArea,
  type MyProjectLocale,
} from "./i18n";
import type { LazyNamespace } from "./i18n/generated/i18n-types.generated";

export async function exampleEnsureNamespacesLoadedForArea(): Promise<void> {
  const euI18n = createI18n({});
  await ensureNamespacesLoadedForArea(euI18n, "eu", ["default"]);

  const amerI18n = createI18n({});
  await ensureNamespacesLoadedForArea(amerI18n, "amer", ["default"]);

  console.log("default.some_key @ it (eu area):", euI18n.get("default", "some_key", "it"));
  console.log("default.some_key @ fr (eu area):", euI18n.get("default", "some_key", "fr"));
  console.log("default.some_key @ es (eu area):", euI18n.get("default", "some_key", "es"));
  console.log("default.some_key @ en (eu area):", euI18n.get("default", "some_key", "en"));
  console.log(
    "default.some_key @ en-US (amer area, fallback to en):",
    amerI18n.get("default", "some_key", "en-US")
  );
  console.log(
    "default.some_key @ es-AR (amer area, local override):",
    amerI18n.get("default", "some_key", "es-AR")
  );
  console.log(
    "default.welcome @ it (eu area):",
    euI18n.get("default", "welcome", "it", { name: "Ada" })
  );
  console.log(
    "default.welcome @ en (eu area):",
    euI18n.get("default", "welcome", "en", { name: "Alex" })
  );
  console.log(
    "default.welcome @ es (eu area):",
    euI18n.get("default", "welcome", "es", { name: "Luis" })
  );
  console.log(
    "default.welcome @ en-US (amer area, fallback to en):",
    amerI18n.get("default", "welcome", "en-US", { name: "Sam" })
  );
  console.log(
    "default.welcome @ es-AR (amer area, fallback to es):",
    amerI18n.get("default", "welcome", "es-AR", { name: "Martín" })
  );
}

export async function exampleCreateI18nForArea(): Promise<void> {
  const euI18n = await createI18nForArea("eu");
  const amerI18n = await createI18nForArea("amer");

  console.log(
    "default.some_other_key @ it (runtime fallback to en, not in default.eu.json):",
    euI18n.get("default", "some_other_key", "it")
  );
  console.log(
    "default.some_other_key @ en-US (projected from en in default.amer.json):",
    amerI18n.get("default", "some_other_key", "en-US")
  );
  console.log(
    "default.some_key @ es-AR (canonical override, not es 'Hola'):",
    amerI18n.get("default", "some_key", "es-AR")
  );
}

export async function exampleEnsureNamespacesByLocale(): Promise<void> {
  for (const locale of ["it", "en-US", "es-AR"] as const satisfies readonly MyProjectLocale[]) {
    const area = LOCALE_DELIVERY_AREA[locale];
    const i18n = await createI18nForArea(area, ["default", "billing"]);

    console.log(
      `billing.invoice_summary @ ${locale} (LOCALE_DELIVERY_AREA → ${area}):`,
      i18n.get("billing", "invoice_summary", locale, { count: 1 })
    );
  }
}

export async function exampleEnsureNamespacesPerArea(): Promise<void> {
  for (const area of ["eu", "amer"] as const satisfies readonly MyProjectDeliveryArea[]) {
    const i18n = await createI18nForArea(area, ["default", "billing"]);

    if (area === "eu") {
      console.log(
        "billing.invoice_summary @ it (eu loader):",
        i18n.get("billing", "invoice_summary", "it", { count: 2 })
      );
      console.log(
        "billing.account_balance @ fr (eu loader):",
        i18n.get("billing", "account_balance", "fr", { amount: 99.5 })
      );
      console.log(
        "billing.invoice_summary @ es (eu loader):",
        i18n.get("billing", "invoice_summary", "es", { count: 3 })
      );
    } else {
      console.log(
        "billing.invoice_summary @ en-US (amer loader):",
        i18n.get("billing", "invoice_summary", "en-US", { count: 1 })
      );
      console.log(
        "billing.account_balance @ en-US (amer loader):",
        i18n.get("billing", "account_balance", "en-US", { amount: 250 })
      );
      console.log(
        "billing.invoice_summary @ es-AR (amer loader, fallback to es):",
        i18n.get("billing", "invoice_summary", "es-AR", { count: 2 })
      );
    }
  }
}

export async function exampleEnsureNamespacesForRoute(): Promise<void> {
  const euI18n = createI18n({});
  await ensureNamespacesLoadedForArea(euI18n, "eu", ["billing"] satisfies readonly LazyNamespace[]);

  console.log(
    "billing.invoice_summary @ it (route-scoped ensureNamespacesLoadedForArea):",
    euI18n.get("billing", "invoice_summary", "it", { count: 7 })
  );
}

export async function exampleProjectNamespaceLocalesPatch(): Promise<void> {
  const euI18n = await createI18nForArea("eu", ["default"]);
  const billing = await namespaceLoaders.billing("eu");
  euI18n.setNamespace("billing", projectNamespaceLocales(billing, ["it"]));

  console.log(
    "billing.invoice_summary @ it (projectNamespaceLocales + setNamespace):",
    euI18n.get("billing", "invoice_summary", "it", { count: 3 })
  );
}

export async function exampleExternalNamespacePatch(): Promise<void> {
  const amerI18n = await createI18nForArea("amer", ["default"]);
  const rawBilling: unknown = await namespaceLoaders.billing("amer");

  const result = validateExternalNamespace("billing", rawBilling);
  if (!result.ok) {
    console.error("billing setNamespace validation failed:", formatIssues(result.issues));
    return;
  }

  amerI18n.setNamespace("billing", result.data);

  console.log(
    "billing.invoice_summary @ en-US (patched from billing.amer.json):",
    amerI18n.get("billing", "invoice_summary", "en-US", { count: 5 })
  );
}

export async function exampleExternalDictionaryHydration(): Promise<void> {
  const euI18n = await createI18nForArea("eu", ["default"]);
  const raw = await loadExternalTranslations("eu");

  const result = validateExternalDictionary(raw);
  if (!result.ok) {
    console.error("setAll validation failed:", formatIssues(result.issues));
    return;
  }

  euI18n.setAll(result.data);

  console.log(
    "billing.invoice_summary @ it (hydrated, custom eu area):",
    euI18n.get("billing", "invoice_summary", "it", { count: 4 })
  );
}

async function loadExternalTranslations(area: MyProjectDeliveryArea): Promise<unknown> {
  const [defaultNs, billing] = await Promise.all([
    namespaceLoaders.default(area),
    namespaceLoaders.billing(area),
  ]);

  return {
    default: defaultNs,
    billing,
  };
}

async function main(): Promise<void> {
  await exampleEnsureNamespacesLoadedForArea();
  await exampleCreateI18nForArea();
  await exampleEnsureNamespacesByLocale();
  await exampleEnsureNamespacesPerArea();
  await exampleEnsureNamespacesForRoute();
  await exampleProjectNamespaceLocalesPatch();
  await exampleExternalNamespacePatch();
  await exampleExternalDictionaryHydration();
}

void main();
