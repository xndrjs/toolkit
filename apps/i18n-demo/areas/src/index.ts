import { createI18nForArea, type MyProjectDeliveryArea } from "./i18n";

async function main(): Promise<void> {
  const viewEu = await createI18nForArea("eu", ["default", "billing"]);
  console.log("default.some_key @ it (eu):", viewEu.t("default", "some_key", "it"));
  console.log(
    "billing.invoice_summary @ it (eu):",
    viewEu.t("billing", "invoice_summary", "it", { count: 2 })
  );

  const viewAmer = await createI18nForArea("amer", ["default", "billing"]);
  console.log("default.some_key @ en-US (amer):", viewAmer.t("default", "some_key", "en-US"));

  for (const area of ["eu", "amer"] as const satisfies readonly MyProjectDeliveryArea[]) {
    const view = await createI18nForArea(area, ["billing"]);
    console.log(
      `billing.invoice_summary @ en (area=${area}):`,
      view.t("billing", "invoice_summary", "en", { count: 1 })
    );
  }
}

void main();
