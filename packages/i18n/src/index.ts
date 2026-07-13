export type {
  I18nEngineMulti,
  I18nEngineMultiImpl,
  I18nEngineSingle,
  I18nEngineSingleImpl,
} from "./engine.js";

export type {
  CanonicalLoader,
  I18nBuilderMulti,
  I18nBuilderMultiForLocale,
  I18nBuilderMultiOptions,
  I18nBuilderSingle,
  I18nBuilderSingleForLocale,
  I18nBuilderSingleOptions,
  NamespaceLoader,
  PartitionedLoader,
} from "./builder.js";
export {
  createI18nBuilder,
  createI18nMultiBuilder,
  createI18nSingleBuilder,
  invokeNamespaceLoader,
} from "./builder.js";

export type {
  TranslationProviderSingle,
  TranslationProviderSingleForLocale,
} from "./IcuTranslationProviderSingle.js";
export { IcuTranslationProviderSingle } from "./IcuTranslationProviderSingle.js";

export type {
  TranslationProviderMulti,
  TranslationProviderMultiForLocale,
} from "./IcuTranslationProviderMulti.js";
export { IcuTranslationProviderMulti } from "./IcuTranslationProviderMulti.js";

export type { I18nViewMulti, I18nViewMultiForLocale } from "./view-multi.js";
export type { I18nViewSingle, I18nViewSingleForLocale } from "./view-single.js";

export type {
  MultiParams,
  ParamsForNamespaces,
  SchemaForNamespaces,
  SingleParams,
} from "./view-types.js";

export type {
  IcuTranslationProviderOptions,
  KeyDictionary,
  LocaleDictionary,
  LocaleFallbackMap,
  LocaleOfMulti,
  LocaleOfSingle,
  MissingTranslationContext,
  MultiDictionary,
  PartialKeyDictionary,
  PartialMultiDictionary,
  OnMissingTranslation,
} from "./types.js";

export {
  formatLocaleFallbackChain,
  resolveLocaleTemplate,
  validateLocaleFallback,
} from "./resolve-locale.js";
export type { ResolvedLocaleTemplate } from "./resolve-locale.js";

export {
  mergeDictionaryLocalesCore,
  mergeNamespaceLocalesCore,
  projectDictionaryForDeliveryAreaCore,
  projectDictionaryLocalesCore,
  projectNamespaceForDeliveryAreaCore,
  projectNamespaceLocalesCore,
} from "./project-locales.js";
