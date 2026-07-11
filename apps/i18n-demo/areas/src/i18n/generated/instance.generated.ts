// Automatically generated code. Do not edit manually.
import {
  IcuTranslationProviderMulti,
  projectNamespaceLocalesCore,
  projectDictionaryLocalesCore,
  projectNamespaceForDeliveryAreaCore,
  projectDictionaryForDeliveryAreaCore,
  type OnMissingTranslation,
} from "@xndrjs/i18n";
import type { MyProjectParams, MyProjectSchema, InitialSchema } from "./i18n-types.generated";
import { LOCALE_FALLBACK, type MyProjectLocale } from "./i18n-types.generated";

export function createI18n(
  dictionary: InitialSchema,
  options?: { onMissing?: OnMissingTranslation }
) {
  return new IcuTranslationProviderMulti<
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
  return projectDictionaryLocalesCore(dictionary, locales, LOCALE_FALLBACK);
}

export function projectNamespaceLocales(
  dictionary: MyProjectSchema["default"],
  locales: readonly MyProjectLocale[]
): MyProjectSchema["default"];
export function projectNamespaceLocales(
  dictionary: MyProjectSchema["billing"],
  locales: readonly MyProjectLocale[]
): MyProjectSchema["billing"];
export function projectNamespaceLocales(
  dictionary: MyProjectSchema[keyof MyProjectSchema],
  locales: readonly MyProjectLocale[]
): MyProjectSchema[keyof MyProjectSchema] {
  return projectNamespaceLocalesCore(dictionary, locales, LOCALE_FALLBACK);
}

export function projectDictionaryForDeliveryArea(
  dictionary: MyProjectSchema,
  areaLocales: readonly MyProjectLocale[]
): MyProjectSchema {
  return projectDictionaryForDeliveryAreaCore(dictionary, areaLocales, LOCALE_FALLBACK);
}

export function projectNamespaceForDeliveryArea(
  dictionary: MyProjectSchema["default"],
  areaLocales: readonly MyProjectLocale[]
): MyProjectSchema["default"];
export function projectNamespaceForDeliveryArea(
  dictionary: MyProjectSchema["billing"],
  areaLocales: readonly MyProjectLocale[]
): MyProjectSchema["billing"];
export function projectNamespaceForDeliveryArea(
  dictionary: MyProjectSchema[keyof MyProjectSchema],
  areaLocales: readonly MyProjectLocale[]
): MyProjectSchema[keyof MyProjectSchema] {
  return projectNamespaceForDeliveryAreaCore(dictionary, areaLocales, LOCALE_FALLBACK);
}
