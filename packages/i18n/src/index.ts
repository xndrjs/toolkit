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
  MultiDictionary,
  RequestLocale,
} from "./types.js";

export {
  formatLocaleFallbackChain,
  resolveLocaleTemplate,
  validateLocaleFallback,
} from "./resolve-locale.js";
export type { ResolvedLocaleTemplate } from "./resolve-locale.js";

export { ensureNamespacesLoadedImpl } from "./ensure-namespace.js";
export type { EnsureNamespacesLoadedOptions } from "./ensure-namespace.js";
