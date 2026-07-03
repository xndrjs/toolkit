// Automatically generated code. Do not edit manually.
import { IcuTranslationProviderSingle } from "@xndrjs/i18n";
import { dictionary } from "./dictionary.generated.js";
import type { MyProjectParams, MyProjectSchema } from "./i18n-types.generated.js";
import { LOCALE_FALLBACK, type MyProjectLocale } from "./i18n-types.generated.js";

export function createI18n(initialDictionary: MyProjectSchema = dictionary) {
  return new IcuTranslationProviderSingle<
    MyProjectSchema,
    MyProjectParams,
    MyProjectLocale,
    typeof LOCALE_FALLBACK
  >(initialDictionary, {
    localeFallback: LOCALE_FALLBACK,
  });
}
