import { i18n } from "./i18n";

const { t } = i18n;

console.log("welcome @ en:", t("welcome", "en", { name: "Ada" }));
console.log("welcome @ it:", t("welcome", "it", { name: "Ada" }));
console.log("goodbye @ en (onMissing: key):", t("goodbye" as "welcome", "en", { name: "Ada" }));
