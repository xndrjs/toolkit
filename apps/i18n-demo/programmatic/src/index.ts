import { i18n } from "./i18n";

console.log("welcome @ en:", i18n.t("welcome", "en", { name: "Ada" }));
console.log("welcome @ it:", i18n.t("welcome", "it", { name: "Ada" }));
console.log(
  "goodbye @ en (onMissing: key):",
  i18n.t("goodbye" as "welcome", "en", { name: "Ada" })
);
