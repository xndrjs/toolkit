// Automatically generated code. Do not edit manually.
import {
  IcuTranslationProviderSingle,
  projectNamespaceLocalesCore,
  type OnMissingTranslation,
} from "@xndrjs/i18n";
import type { MyProjectParams, MyProjectSchema } from "./i18n-types.generated";
import { LOCALE_FALLBACK, type MyProjectLocale } from "./i18n-types.generated";

export function createI18n(
  dictionary: MyProjectSchema,
  options?: { onMissing?: OnMissingTranslation }
) {
  return new IcuTranslationProviderSingle<
    MyProjectSchema,
    MyProjectParams,
    MyProjectLocale,
    typeof LOCALE_FALLBACK
  >(dictionary, {
    localeFallback: LOCALE_FALLBACK,
    ...options,
  });
}

export function projectDictionaryLocales(
  dictionary: MyProjectSchema,
  locales: readonly MyProjectLocale[]
): MyProjectSchema {
  return projectNamespaceLocalesCore(dictionary, locales, LOCALE_FALLBACK);
}
