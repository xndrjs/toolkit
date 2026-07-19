export type {
  DeliveryArtifactsMap,
  LocalesForDeliveryArea,
  LocalesForDeliveryAreaOrAll,
} from "./builder-types.js";

export type { I18nEngineMulti, I18nEngineMultiImpl } from "./engine.js";

export type {
  I18nHandle,
  I18nHandleOptions,
  LoadNamespacesInput,
  NamespaceLoader,
  PartitionForLocale,
  PartitionedLoader,
  ScopeForLocale,
} from "./builder.js";
export { createI18nHandle, invokeNamespaceLoader } from "./builder.js";

export type { BuilderResourceEntry } from "./builder-load-registry.js";
export type { I18nCreateInput, I18nSerializedState } from "./serialized-state.js";
export { normalizeI18nCreateInput } from "./serialized-state.js";

export { IcuTranslationProviderMulti } from "./IcuTranslationProviderMulti.js";

export type { I18nScopeMulti, I18nScopeMultiForLocale } from "./scope-multi.js";

export type {
  MultiParams,
  NamespaceBoundTranslateFn,
  ParamsForNamespaces,
  SchemaForNamespaces,
} from "./scope-types.js";

export type {
  IcuTranslationProviderOptions,
  KeyDictionary,
  LocaleDictionary,
  LocaleFallbackMap,
  LocaleOfKeys,
  LocaleOfMulti,
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

export { mergeDictionaryLocalesCore, mergeNamespaceLocalesCore } from "./project-locales.js";

export type { FetchArtifact, DeliveryResourceId } from "./fetch-artifact.js";
