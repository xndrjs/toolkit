import { createI18n, type MyProjectDeliveryArea } from "./i18n";

async function main(): Promise<void> {
  const i18n = createI18n({});

  const euScope = await i18n.withNamespaces(["default", "billing"]).withDeliveryArea("eu").load();

  console.log("default.some_key @ it (eu):", euScope.t("default", "some_key", "it"));
  console.log(
    "billing.invoice_summary @ it (eu):",
    euScope.t("billing", "invoice_summary", "it", { count: 2 })
  );

  const amerScope = await i18n
    .withNamespaces(["default", "billing"])
    .withDeliveryArea("amer")
    .load();
  console.log("default.some_key @ en-US (amer):", amerScope.t("default", "some_key", "en-US"));

  for (const area of ["eu", "amer"] as const satisfies readonly MyProjectDeliveryArea[]) {
    const scope = await i18n.withNamespaces(["billing"]).withDeliveryArea(area).load();
    console.log(
      `billing.invoice_summary @ en (area=${area}):`,
      scope.t("billing", "invoice_summary", "en", { count: 1 })
    );
  }
}

void main();
