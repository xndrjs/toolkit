// Automatically generated code. Do not edit manually.
import { IcuTranslationProviderMulti } from "@xndrjs/i18n";
import { dictionary } from "./dictionary.generated";
import type { MyProjectParams, MyProjectSchema, InitialSchema } from "./i18n-types.generated";
import { LOCALE_FALLBACK, type MyProjectLocale } from "./i18n-types.generated";

export function createI18n(initialDictionary: InitialSchema = dictionary) {
  return new IcuTranslationProviderMulti<
    MyProjectSchema,
    MyProjectParams,
    MyProjectLocale,
    typeof LOCALE_FALLBACK
  >(initialDictionary, {
    localeFallback: LOCALE_FALLBACK,
  });
}
