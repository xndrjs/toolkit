// Automatically generated code. Do not edit manually.
import {
  IcuTranslationProviderMulti,
  createI18nHandle,
  normalizeI18nCreateInput,
  type I18nHandle,
  type I18nHandleOptions,
  type OnMissingTranslation,
} from "@xndrjs/i18n";
import type { MyProjectParams, MyProjectSchema, InitialSchema } from "./i18n-types.generated";
import { LOCALE_FALLBACK, type MyProjectLocale } from "./i18n-types.generated";
import { namespaceLoaders } from "./namespace-loaders.generated";

export function createI18n(options?: {
  state?: { dictionary: InitialSchema; resources?: readonly (readonly [string, string])[] };
  onMissing?: OnMissingTranslation;
}): I18nHandle<MyProjectSchema, MyProjectParams, MyProjectLocale> {
  const { state, ...providerOptions } = options ?? {};
  const normalized = normalizeI18nCreateInput(state);
  const engine = new IcuTranslationProviderMulti<
    MyProjectSchema,
    MyProjectParams,
    MyProjectLocale,
    typeof LOCALE_FALLBACK
  >(normalized.dictionary, {
    localeFallback: LOCALE_FALLBACK,
    ...providerOptions,
  });
  engine.seedBuilderResources(normalized.resources);
  return createI18nHandle<MyProjectSchema, MyProjectParams, MyProjectLocale>(engine, {
    namespaceLoaders,
    partitionForLocale: (locale) => locale,
  } as I18nHandleOptions<MyProjectSchema, MyProjectLocale>);
}
