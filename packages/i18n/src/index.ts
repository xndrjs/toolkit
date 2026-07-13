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
