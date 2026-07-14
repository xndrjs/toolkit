import { formatIssues } from "@xndrjs/i18n/validation";
import {
  createI18n,
  namespaceLoaders,
  validateExternalNamespacePartial,
  type MyProjectDeliveryArea,
} from "./i18n";
import type { MyProjectLocale, MyProjectSchema } from "./i18n/generated/i18n-types.generated";

const demoArea = "eu" as const satisfies MyProjectDeliveryArea;
const demoLocale = "en" as const satisfies MyProjectLocale;

export async function exampleDeliveryAreas(): Promise<void> {
  const i18n = createI18n({});

  const { t: tEu } = await i18n
    .withNamespaces(["default", "billing"])
    .withDeliveryArea("eu")
    .load();

  console.log("default.some_key @ it (eu):", tEu("default", "some_key", "it"));
  console.log(
    "billing.invoice_summary @ it (eu):",
    tEu("billing", "invoice_summary", "it", { count: 2 })
  );

  const { t: tAmer } = await i18n
    .withNamespaces(["default", "billing"])
    .withDeliveryArea("amer")
    .load();
  console.log("default.some_key @ en-US (amer):", tAmer("default", "some_key", "en-US"));

  for (const area of ["eu", "amer"] as const satisfies readonly MyProjectDeliveryArea[]) {
    const { t } = await i18n.withNamespaces(["billing"]).withDeliveryArea(area).load();
    console.log(
      `billing.invoice_summary @ en (area=${area}):`,
      t("billing", "invoice_summary", "en", { count: 1 })
    );
  }
}

export async function exampleExternalNamespacePatch(): Promise<void> {
  const rawBilling: unknown = await namespaceLoaders.billing(demoArea);

  const result = validateExternalNamespacePartial("billing", rawBilling);
  if (!result.ok) {
    console.error("billing validation failed:", formatIssues(result.issues));
    return;
  }

  const scope = await createI18n({}).withNamespaces(["billing"]).withDeliveryArea(demoArea).load();

  const { t, set } = scope.forLocale(demoLocale);

  for (const key of Object.keys(result.data) as (keyof MyProjectSchema["billing"])[]) {
    const template = result.data[key]?.[demoLocale];
    if (template !== undefined) {
      set("billing", key, template);
    }
  }

  set(
    "billing",
    "invoice_summary",
    "You have {count, plural, one {1 invoice from CMS} other {{count} invoices from CMS}}"
  );

  console.log(
    "billing.invoice_summary @ en (hydrated):",
    t("billing", "invoice_summary", { count: 2 })
  );
}

async function main(): Promise<void> {
  await exampleDeliveryAreas();
  await exampleExternalNamespacePatch();
}

void main();
