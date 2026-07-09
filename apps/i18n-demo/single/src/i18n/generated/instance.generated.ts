// Automatically generated code. Do not edit manually.
import { IcuTranslationProviderSingle, projectLocales as projectLocalesCore } from "@xndrjs/i18n";
import type { MyProjectParams, MyProjectSchema } from "./i18n-types.generated";
import { LOCALE_FALLBACK, type MyProjectLocale } from "./i18n-types.generated";

export function createI18n(dictionary: MyProjectSchema) {
  return new IcuTranslationProviderSingle<
    MyProjectSchema,
    MyProjectParams,
    MyProjectLocale,
    typeof LOCALE_FALLBACK
  >(dictionary, {
    localeFallback: LOCALE_FALLBACK,
  });
}

export function projectLocales(
  dictionary: MyProjectSchema,
  locales: readonly MyProjectLocale[]
): MyProjectSchema {
  return projectLocalesCore(dictionary, locales, LOCALE_FALLBACK);
}
