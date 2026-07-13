// Automatically generated code. Do not edit manually.
import {
  IcuTranslationProviderMulti,
  projectNamespaceLocalesCore,
  projectDictionaryLocalesCore,
  createI18nBuilder,
  createI18nMultiBuilder,
  type I18nBuilderMulti,
  type I18nBuilderMultiOptions,
  type I18nBuilderMultiPartitioned,
  type I18nScopeMulti,
  type I18nScopeSingle,
  type OnMissingTranslation,
} from "@xndrjs/i18n";
import type { MyProjectParams, MyProjectSchema, InitialSchema } from "./i18n-types.generated";
import { LOCALE_FALLBACK, type MyProjectLocale } from "./i18n-types.generated";
import { namespaceLoaders } from "./namespace-loaders.generated";

export function createI18n(
  dictionary: InitialSchema,
  options?: { onMissing?: OnMissingTranslation }
): I18nBuilderMulti<MyProjectSchema, MyProjectParams, MyProjectLocale> {
  const engine = new IcuTranslationProviderMulti<
    MyProjectSchema,
    MyProjectParams,
    MyProjectLocale,
    typeof LOCALE_FALLBACK
  >(dictionary, {
    localeFallback: LOCALE_FALLBACK,
    ...options,
  });
  return createI18nMultiBuilder<MyProjectSchema, MyProjectParams, MyProjectLocale>(engine, {
    namespaceLoaders,
  } as I18nBuilderMultiOptions<MyProjectSchema, MyProjectLocale>);
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
