import { createI18n, type MyProjectDeliveryArea } from "./i18n";

async function main(): Promise<void> {
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

void main();
