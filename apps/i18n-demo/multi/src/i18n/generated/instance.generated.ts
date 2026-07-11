// Automatically generated code. Do not edit manually.
import {
  IcuTranslationProviderMulti,
  projectNamespaceLocalesCore,
  projectDictionaryLocalesCore,
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
  dictionary: MyProjectSchema["user"],
  locales: readonly MyProjectLocale[]
): MyProjectSchema["user"];
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
