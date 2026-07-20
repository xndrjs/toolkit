import type { IcuTranslationProviderMulti } from "./IcuTranslationProviderMulti.js";
import type {
  LocaleFallbackMap,
  LocaleOfMulti,
  MultiDictionary,
  PartialMultiDictionary,
} from "./types.js";
import type { I18nScopeMulti, I18nScopeMultiForLocale } from "./scope-multi.js";
import type { MultiParams, ParamsForNamespaces, SchemaForNamespaces } from "./scope-types.js";

/** Mutable translation engine for a multi-namespace dictionary. */
export interface I18nEngineMulti<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string = LocaleOfMulti<Schema>,
> {
  readonly __i18nEngineMode: "multi";
  /** Loaded namespaces only — may be empty at cold start. */
  getAll(): PartialMultiDictionary<Schema, RequestLocales>;
  toScope<NsList extends readonly (keyof Schema & string)[]>(options: {
    namespaces: NsList;
  }): I18nScopeMulti<
    SchemaForNamespaces<Schema, NsList>,
    ParamsForNamespaces<Schema, Params, NsList>,
    RequestLocales
  >;
  toScope<
    NsList extends readonly (keyof Schema & string)[],
    Locale extends RequestLocales,
  >(options: {
    namespaces: NsList;
    locale: Locale;
  }): I18nScopeMultiForLocale<
    SchemaForNamespaces<Schema, NsList>,
    ParamsForNamespaces<Schema, Params, NsList>,
    RequestLocales,
    Locale
  >;
}

/** Alias for the default multi-namespace engine implementation. */
export type I18nEngineMultiImpl<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string = LocaleOfMulti<Schema>,
  Fallback extends LocaleFallbackMap | undefined = undefined,
> = IcuTranslationProviderMulti<Schema, Params, RequestLocales, Fallback>;
