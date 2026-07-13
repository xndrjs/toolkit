export type {
  DeliveryArtifactsMap,
  LocalesForDeliveryArea,
  LocalesForDeliveryAreaOrAll,
} from "./builder-types.js";

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
  I18nBuilderMultiPartitioned,
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

export { IcuTranslationProviderSingle } from "./IcuTranslationProviderSingle.js";

export { IcuTranslationProviderMulti } from "./IcuTranslationProviderMulti.js";

export type { I18nScopeMulti, I18nScopeMultiForLocale } from "./scope-multi.js";
export type { I18nScopeSingle, I18nScopeSingleForLocale } from "./scope-single.js";

export type {
  MultiParams,
  ParamsForNamespaces,
  SchemaForNamespaces,
  SingleParams,
} from "./scope-types.js";

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
