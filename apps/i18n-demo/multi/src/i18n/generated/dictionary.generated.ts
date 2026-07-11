// Automatically generated code. Do not edit manually.
import defaultDeCH from "./translations/default.de-CH.json";
import defaultDeDE from "./translations/default.de-DE.json";
import defaultEn from "./translations/default.en.json";
import defaultIt from "./translations/default.it.json";
import type { InitialSchema, MyProjectLocale, MyProjectSchema } from "./i18n-types.generated";

const defaultByLocale = {
  "de-CH": defaultDeCH,
  "de-DE": defaultDeDE,
  en: defaultEn,
  it: defaultIt,
} as const;

export function defaultDictionaryFor(locale: MyProjectLocale): InitialSchema {
  return {
    default: defaultByLocale[locale],
  };
}
