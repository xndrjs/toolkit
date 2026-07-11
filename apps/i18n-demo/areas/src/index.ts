import { formatIssues } from "@xndrjs/i18n/validation";
import {
  createI18n,
  defaultDictionaryFor,
  LOCALE_DELIVERY_AREA,
  namespaceLoaders,
  projectNamespaceLocales,
  type MyProjectDeliveryArea,
  type MyProjectLocale,
} from "./i18n";
import {
  validateExternalDictionary,
  validateExternalNamespace,
} from "./i18n/generated/dictionary-schema.generated";

export function exampleInitPerArea(): void {
  const euI18n = createI18n(defaultDictionaryFor("eu"));
  const amerI18n = createI18n(defaultDictionaryFor("amer"));

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

export function exampleProjectionInEuArea(): void {
  const euI18n = createI18n(defaultDictionaryFor("eu"));

  // `it` falls back to `en` inside eu → preserve mode: no `it` entry in default.eu.json for this key.
  console.log(
    "default.some_other_key @ it (runtime fallback to en, not in default.eu.json):",
    euI18n.get("default", "some_other_key", "it")
  );
  console.log(
    "default.some_other_key @ en (canonical in default.eu.json):",
    euI18n.get("default", "some_other_key", "en")
  );
  console.log(
    "default.some_other_key @ fr (canonical in default.eu.json):",
    euI18n.get("default", "some_other_key", "fr")
  );
  console.log(
    "default.some_other_key @ es (canonical in default.eu.json):",
    euI18n.get("default", "some_other_key", "es")
  );
}

export function exampleProjectionInAmerArea(): void {
  const amerI18n = createI18n(defaultDictionaryFor("amer"));

  // en-US falls back to en (eu area); es-AR has only `some_key` in canonical.
  console.log(
    "default.some_other_key @ en-US (projected from en in default.amer.json):",
    amerI18n.get("default", "some_other_key", "en-US")
  );
  console.log(
    "default.some_key @ es-AR (canonical override, not es 'Hola'):",
    amerI18n.get("default", "some_key", "es-AR")
  );
}

export async function exampleLazyNamespaceLoadingByLocale(): Promise<void> {
  for (const locale of ["it", "en-US", "es-AR"] as const satisfies readonly MyProjectLocale[]) {
    const area = LOCALE_DELIVERY_AREA[locale];
    const i18n = createI18n(defaultDictionaryFor(area));
    i18n.setNamespace("billing", await namespaceLoaders.billing(area));

    console.log(
      `billing.invoice_summary @ ${locale} (via LOCALE_DELIVERY_AREA → ${area}):`,
      i18n.get("billing", "invoice_summary", locale, { count: 1 })
    );
  }
}

export async function exampleLazyNamespaceLoadingPerArea(): Promise<void> {
  for (const area of ["eu", "amer"] as const satisfies readonly MyProjectDeliveryArea[]) {
    const i18n = createI18n(defaultDictionaryFor(area));
    i18n.setNamespace("billing", await namespaceLoaders.billing(area));

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

export async function exampleProjectNamespaceLocalesPatch(): Promise<void> {
  const euI18n = createI18n(defaultDictionaryFor("eu"));
  const billing = await namespaceLoaders.billing("eu");
  euI18n.setNamespace("billing", projectNamespaceLocales(billing, ["it"]));

  console.log(
    "billing.invoice_summary @ it (projectNamespaceLocales + setNamespace):",
    euI18n.get("billing", "invoice_summary", "it", { count: 3 })
  );
}

export async function exampleExternalNamespacePatch(): Promise<void> {
  const amerI18n = createI18n(defaultDictionaryFor("amer"));
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
  const euI18n = createI18n(defaultDictionaryFor("eu"));
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
  const billing = await namespaceLoaders.billing(area);

  return {
    ...defaultDictionaryFor(area),
    billing,
  };
}

async function main(): Promise<void> {
  exampleInitPerArea();
  exampleProjectionInEuArea();
  exampleProjectionInAmerArea();
  await exampleLazyNamespaceLoadingByLocale();
  await exampleLazyNamespaceLoadingPerArea();
  await exampleProjectNamespaceLocalesPatch();
  await exampleExternalNamespacePatch();
  await exampleExternalDictionaryHydration();
}

void main();
